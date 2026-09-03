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

export const productTag = (slug: string) => `product:${slug}`;
export const productListTag = "product-list";

/**
 * Static product content — cached, and deliberately carrying no price or stock.
 *
 * The split is the whole point: this can sit in a shared cache for days and
 * still never serve a stale price, because the price is not in here.
 * Invalidated by tag when the backend publishes (see /api/revalidate).
 */
export async function getProduct(slug: string): Promise<Product> {
  "use cache";
  cacheLife("days");
  cacheTag(productTag(slug));

  const { data, error, response } = await publicCommerceClient().GET(
    "/products/{slug}",
    { params: { path: { slug } } },
  );

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }
  return data;
}

export async function listProducts(params?: {
  category?: string;
  cursor?: string;
  limit?: number;
}) {
  "use cache";
  cacheLife("hours");
  cacheTag(productListTag);

  const { data, error, response } = await publicCommerceClient().GET(
    "/products",
    {
      params: { query: params ?? {} },
    },
  );

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }
  return data;
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
