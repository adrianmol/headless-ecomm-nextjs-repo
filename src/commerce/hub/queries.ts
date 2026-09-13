import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CommerceErrorException, schemaViolation } from "../errors";
import { HubError, hubFetch } from "./client";
import {
  hubCategorySchema,
  hubPaginationSchema,
  hubProductDetailSchema,
  hubProductSummarySchema,
  toCategory,
  toOffer,
  toPagination,
  toProductDetail,
  toProductSummary,
  toStock,
  hubPriceSchema,
  hubStockSchema,
  type HubCategory,
  type HubOffer,
  type HubPagination,
  type HubProductDetail,
  type HubProductSummary,
  type HubStock,
} from "./schemas";
import { z } from "zod";

/**
 * Read paths for the HUB catalog API.
 *
 * The caching split follows the contract's own stated design: pages are cached
 * because names and descriptions do not change, and the numbers are refreshed
 * with one small request. That is the same policy this storefront already
 * applies — a cached shell that structurally cannot serve a stale price, because
 * the price is not in the cached payload at all.
 *
 *   catalogue tree, category pages, product detail  -> cached, hours
 *   `getLiveOffers`                                 -> NEVER cached
 *
 * If `getLiveOffers` ever acquires `use cache`, the storefront starts showing
 * prices it believes are live and are not. That is the failure this whole
 * arrangement exists to make impossible.
 */

export const hubCatalogTag = "hub-catalog";
export const hubCategoryTag = (id: number) => `hub-category:${id}`;
export const hubProductTag = (key: string) => `hub-product:${key}`;

/** Upstream caps this at 100; asking for more is a `bad_request`. */
const MAX_PER_PAGE = 100;
/** Upstream caps `live` at 200 ids, for the reason the contract gives. */
export const MAX_LIVE_KEYS = 200;

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  // A schema violation is an infrastructure fault, not a user error — same
  // treatment as the rest of the data layer.
  if (!parsed.success) throw new CommerceErrorException(schemaViolation());
  return parsed.data;
}

/**
 * The whole category tree, flat, each node carrying its parent.
 *
 * Returned flat deliberately, mirroring the contract: composing a tree is the
 * client's job, and callers here get the parent pointers to do it with.
 *
 * **Two measured caveats a caller must handle** (2026-09-13, 11,991 nodes):
 *
 *  - 9,030 nodes (75%) name a parent id that is not in the list — 17 missing
 *    parents in total. A naive tree build rooted at `parentId === 0` therefore
 *    shows only a quarter of the catalogue and silently drops the rest.
 *  - Every node has an empty `slug`, so category URLs cannot be slug-based.
 *
 * Neither is worked around here, because inventing a synthetic parent or slug
 * would be inventing catalogue structure. See docs/next-steps.md.
 */
export async function getHubCategories(options?: {
  withCounts?: boolean;
}): Promise<readonly HubCategory[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(hubCatalogTag);

  // Query assembled once, here, and handed to the client as a finished string:
  // the signature covers the path exactly as sent.
  const path = options?.withCounts
    ? "/hub-api/v1/category?numara=1"
    : "/hub-api/v1/category";

  const data = await hubFetch<unknown>(path);
  const parsed = parseOrThrow(
    z.object({
      shop: z.string().nullable().optional(),
      categorii: z.array(hubCategorySchema),
    }),
    data,
  );

  return parsed.categorii.map(toCategory);
}

export type HubCategoryPage = {
  /** The key's shop code; null means the whole catalogue. */
  shop: string | null;
  category: HubCategory;
  /** Direct children, so navigation does not need the whole tree. */
  children: readonly HubCategory[];
  products: readonly HubProductSummary[];
  pagination: HubPagination;
};

export type HubSort = "nume" | "pret" | "pret_desc" | "nou";

/**
 * One category: itself, its direct children, and a page of products.
 *
 * Pagination here is **page-based** (`pagina`/`pe_pagina`), unlike the
 * cursor-based listing the storefront currently implements. It is surfaced as
 * page/perPage rather than translated into a fake cursor: a synthetic cursor
 * would imply stable ordering across inserts that this API does not promise.
 */
export async function getHubCategoryPage(
  id: number,
  options?: {
    page?: number;
    perPage?: number;
    sort?: HubSort;
    /** Include products from subcategories at any depth. */
    deep?: boolean;
  },
): Promise<HubCategoryPage> {
  "use cache";
  cacheLife("hours");
  cacheTag(hubCatalogTag, hubCategoryTag(id));

  if (!Number.isInteger(id) || id <= 0) {
    throw new CommerceErrorException(schemaViolation());
  }

  const params = new URLSearchParams();
  if (options?.page !== undefined) params.set("pagina", String(options.page));
  if (options?.perPage !== undefined) {
    params.set("pe_pagina", String(Math.min(options.perPage, MAX_PER_PAGE)));
  }
  if (options?.sort) params.set("sort", options.sort);
  if (options?.deep) params.set("adanc", "1");

  const query = params.toString();
  const data = await hubFetch<unknown>(
    `/hub-api/v1/category/${id}${query ? `?${query}` : ""}`,
  );

  const parsed = parseOrThrow(
    z.object({
      shop: z.string().nullable().default(null),
      categorie: hubCategorySchema,
      copii: z.array(hubCategorySchema).default([]),
      produse: z.array(hubProductSummarySchema).default([]),
      paginare: hubPaginationSchema,
    }),
    data,
  );

  return {
    shop: parsed.shop,
    category: toCategory(parsed.categorie),
    children: parsed.copii.map(toCategory),
    products: parsed.produse.map(toProductSummary),
    pagination: toPagination(parsed.paginare),
  };
}

/**
 * How a product is being identified. The contract is explicit that id, sku and
 * `?url=slug` resolve to the same product with an identical response — so this
 * is one function, not three, and the discriminator only decides the path.
 */
export type HubProductRef =
  | { by: "id"; value: number }
  | { by: "sku"; value: string }
  | { by: "slug"; value: string };

function productPath(
  ref: HubProductRef,
  options?: { withComponents?: boolean; withVariants?: boolean },
): string {
  const params = new URLSearchParams();
  // `componente` defaults to 1 upstream, so it is only sent to switch it off.
  if (options?.withComponents === false) params.set("componente", "0");
  if (options?.withVariants) params.set("rude", "1");

  if (ref.by === "slug") params.set("url", ref.value);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  if (ref.by === "slug") return `/hub-api/v1/product${suffix}`;
  return `/hub-api/v1/product/${encodeURIComponent(String(ref.value))}${suffix}`;
}

/**
 * A full product record.
 *
 * Returns `null` for `not_found` rather than throwing, matching `getProduct` in
 * the existing catalog layer: a missing product is an ordinary outcome a caller
 * renders as a 404, not a fault. Every other HUB failure propagates.
 */
export async function getHubProduct(
  ref: HubProductRef,
  options?: { withComponents?: boolean; withVariants?: boolean },
): Promise<HubProductDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(hubCatalogTag, hubProductTag(String(ref.value)));

  let data: unknown;
  try {
    data = await hubFetch<unknown>(productPath(ref, options));
  } catch (error) {
    if (error instanceof HubError && error.code === "not_found") return null;
    throw error;
  }

  // The product sits under `data.produs`, alongside `shop` — mirroring the
  // category endpoint, which nests under `categorie`. The contract lists the
  // product's fields but not this wrapper, so it was found by parsing a live
  // response rather than by reading: the first version looked for the fields at
  // the top level and failed against production.
  const parsed = parseOrThrow(
    z.object({
      shop: z.string().nullable().default(null),
      produs: hubProductDetailSchema,
    }),
    data,
  );

  return toProductDetail(parsed.produs);
}

export type HubLiveEntry = {
  id: number;
  sku: string;
  offer: HubOffer;
  stock: HubStock;
};

export type HubLiveResult = {
  entries: readonly HubLiveEntry[];
  /**
   * Requested but not returned: withdrawn, EOL or not published here.
   *
   * The contract explains why this matters, and it is the reason this endpoint
   * is worth having: without it the storefront would keep the old price on
   * screen and never learn why. A caller that ignores `missing` has reintroduced
   * exactly the bug the field exists to prevent.
   */
  missing: readonly string[];
};

const hubLiveEntrySchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  pret: hubPriceSchema,
  stoc: hubStockSchema,
});

/**
 * Fresh price and stock for up to {@link MAX_LIVE_KEYS} products.
 *
 * **Has no `use cache` and must never acquire one.** This is the uncached half
 * of the arrangement that makes a stale price structurally impossible.
 */
export async function getHubLiveOffers(
  ref: { ids: readonly number[] } | { skus: readonly string[] },
): Promise<HubLiveResult> {
  const keys = "ids" in ref ? ref.ids : ref.skus;

  if (keys.length === 0) return { entries: [], missing: [] };
  if (keys.length > MAX_LIVE_KEYS) {
    // Refused locally rather than sent: upstream would answer `bad_request`, and
    // the caller's real bug is asking for an unbounded set.
    throw new HubError(
      "bad_request",
      `live lookup accepts at most ${MAX_LIVE_KEYS} keys, received ${keys.length}`,
    );
  }

  const params = new URLSearchParams();
  params.set("ids" in ref ? "ids" : "skus", keys.join(","));

  const data = await hubFetch<unknown>(`/hub-api/v1/live?${params.toString()}`);

  const parsed = parseOrThrow(
    z.object({
      produse: z.array(hubLiveEntrySchema).default([]),
      lipsa: z.array(z.union([z.string(), z.number()])).default([]),
    }),
    data,
  );

  return {
    entries: parsed.produse.map((raw) => ({
      id: raw.id,
      sku: raw.sku,
      offer: toOffer(raw.pret),
      stock: toStock(raw.stoc),
    })),
    missing: parsed.lipsa.map(String),
  };
}
