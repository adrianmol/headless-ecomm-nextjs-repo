import "server-only";
import { commerceClient } from "../client";
import { CommerceErrorException, normalizeError, schemaViolation } from "../errors";
import { offerSchema } from "../schemas";
import type { components } from "../api";

export type Product = components["schemas"]["Product"];
export type Offer = components["schemas"]["Offer"];

/**
 * Static product content. Cacheable with a long TTL — it deliberately carries
 * no price or stock, so a cached PDP shell can never serve a stale price.
 */
export async function getProduct(slug: string): Promise<Product> {
  const { data, error, response } = await commerceClient().GET("/products/{slug}", {
    params: { path: { slug } },
  });

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }
  return data;
}

/**
 * Price and availability. Volatile, so this is fetched separately and rendered
 * inside a Suspense boundary rather than cached with the product content.
 *
 * Validated at runtime (ADR-0003): a wrong price here is charged to a customer.
 */
export async function getOffer(slug: string): Promise<Offer> {
  const { data, error, response } = await commerceClient().GET(
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

export async function listProducts(params?: {
  category?: string;
  cursor?: string;
  limit?: number;
}) {
  const { data, error, response } = await commerceClient().GET("/products", {
    params: { query: params ?? {} },
  });

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }
  return data;
}
