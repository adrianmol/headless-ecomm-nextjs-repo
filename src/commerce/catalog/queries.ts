import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { publicCommerceClient } from "../client";
import {
  CommerceErrorException,
  normalizeError,
  schemaViolation,
} from "../errors";
import { offerSchema } from "../schemas";
import type { components } from "../api";

export type Product = components["schemas"]["Product"];
export type Offer = components["schemas"]["Offer"];
export type Facet = components["schemas"]["Facet"];
export type ProductKind = components["schemas"]["ProductKind"];
export type PrinterBrand = components["schemas"]["PrinterBrand"];
export type PrinterModel = components["schemas"]["PrinterModel"];

export const productTag = (slug: string) => `product:${slug}`;
export const productListTag = "product-list";

/**
 * Compatibility data (printer brands and their models) changes only when the
 * catalog gains a product line, so it gets its own tag: a routine price or
 * stock publish should not evict the dropdown data on every page.
 */
export const compatTag = "compat";

/** Filters accepted by the catalog listing. Mirrors the `/products` query. */
export type CatalogFilter = {
  category?: string;
  cursor?: string;
  limit?: number;
  brand?: string;
  model?: string;
  kind?: ProductKind;
  manufacturer?: string;
  color?: components["schemas"]["ProductColor"];
  inStock?: boolean;
  sort?: "relevance" | "price_asc" | "price_desc" | "yield_desc";
};

/**
 * Static product content — cached, and deliberately carrying no price or stock.
 *
 * The split is the whole point: this can sit in a shared cache for days and
 * still never serve a stale price, because the price is not in here.
 * Invalidated by tag when the backend publishes (see /api/revalidate).
 */
export async function getProduct(slug: string): Promise<Product | null> {
  "use cache";
  cacheLife("days");
  cacheTag(productTag(slug));

  const { data, error, response } = await publicCommerceClient().GET(
    "/products/{slug}",
    { params: { path: { slug } } },
  );

  if (error || !data) {
    const domainError = normalizeError(error, response?.status);
    // A missing product is an ordinary outcome the caller renders as a 404, not
    // a fault. Anything else is a real failure and propagates.
    if (domainError.kind === "NotFound") return null;
    throw new CommerceErrorException(domainError);
  }
  return data;
}

/**
 * Faceted catalog listing.
 *
 * Every distinct filter is its own `use cache` entry, keyed on the arguments,
 * but they all share `productListTag` so a single catalog publish invalidates
 * the whole listing surface rather than leaving some facet combinations stale.
 *
 * The query object is built key by key rather than spread from `params`, so an
 * unexpected caller-supplied property can never be forwarded upstream as a
 * query parameter.
 */
export async function listProducts(params?: CatalogFilter) {
  "use cache";
  cacheLife("hours");
  cacheTag(productListTag);

  const query: Record<string, string | number | boolean> = {};
  if (params?.category) query.category = params.category;
  if (params?.cursor) query.cursor = params.cursor;
  if (params?.limit !== undefined) query.limit = params.limit;
  if (params?.brand) query.brand = params.brand;
  // A model designation is not unique across brands, so filtering on one
  // without a brand would mix results from different manufacturers.
  if (params?.model && params.brand) query.model = params.model;
  if (params?.kind) query.kind = params.kind;
  if (params?.manufacturer) query.manufacturer = params.manufacturer;
  if (params?.color) query.color = params.color;
  if (params?.inStock !== undefined) query.inStock = params.inStock;
  if (params?.sort) query.sort = params.sort;

  const { data, error, response } = await publicCommerceClient().GET(
    "/products",
    {
      params: { query },
    },
  );

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }
  return data;
}

/**
 * Printer brands for the finder. Cached for days: this list changes when the
 * business takes on a new printer manufacturer, which is not a daily event.
 */
export async function listPrinterBrands(): Promise<PrinterBrand[]> {
  "use cache";
  cacheLife("days");
  cacheTag(compatTag);

  const { data, error, response } =
    await publicCommerceClient().GET("/compat/brands");

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }
  return data.items;
}

/**
 * Printer models for one brand — the finder's second step.
 *
 * Returns `[]` rather than throwing for an unknown brand: the brand slug comes
 * from a URL, so a typo is an ordinary visitor outcome that should render an
 * empty finder, not a 500.
 */
export async function listPrinterModels(
  brand: string,
): Promise<PrinterModel[]> {
  "use cache";
  cacheLife("days");
  cacheTag(compatTag);

  const { data, error, response } = await publicCommerceClient().GET(
    "/compat/brands/{brand}/models",
    { params: { path: { brand } } },
  );

  if (error || !data) {
    const domainError = normalizeError(error, response?.status);
    if (domainError.kind === "NotFound") return [];
    throw new CommerceErrorException(domainError);
  }
  return data.items;
}

/**
 * Price and availability. Intentionally NOT cached and never given a cacheTag:
 * it is read at request time behind a Suspense boundary so the customer always
 * sees the live price under a shell that was served from cache.
 *
 * Validated at runtime (ADR-0003) — a wrong price here is charged to someone.
 */
export async function getOffer(slug: string): Promise<Offer> {
  const { data, error, response } = await publicCommerceClient().GET(
    "/products/{slug}/offer",
    { params: { path: { slug } } },
  );

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }

  const parsed = offerSchema.safeParse(data);
  if (!parsed.success) {
    throw new CommerceErrorException(schemaViolation());
  }
  return parsed.data;
}

/**
 * Cap on slugs per batch. A listing page never asks for more than its page
 * size, so this only ever bites if a caller loops — and it keeps a single
 * request from turning into an unbounded upstream query.
 */
const MAX_OFFER_SLUGS = 100;

/**
 * Live offers for a page of products, as a Map keyed by slug.
 *
 * Uncached, like `getOffer`, and for the same reason: the listing grid around
 * it is cached for hours and must never carry a price with it. One batched call
 * per page rather than one per card.
 *
 * A slug missing from the result is returned as absent rather than as an error.
 * The caller renders that card without a price, which is the correct outcome
 * for a product deleted between the cached listing and this call.
 */
export async function listOffers(
  slugs: readonly string[],
): Promise<Map<string, Offer>> {
  const unique = [...new Set(slugs)].slice(0, MAX_OFFER_SLUGS);
  if (unique.length === 0) return new Map();

  const { data, error, response } = await publicCommerceClient().GET(
    "/offers",
    { params: { query: { slugs: unique.join(",") } } },
  );

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }

  const result = new Map<string, Offer>();
  for (const item of data.items) {
    // Validated per item: these are charged figures, and one malformed entry
    // must not be allowed to render as a price. Skipping the bad entry keeps
    // the rest of the grid priced, which beats failing the whole page.
    const parsed = offerSchema.safeParse(item.offer);
    if (parsed.success) result.set(item.slug, parsed.data);
  }
  return result;
}
