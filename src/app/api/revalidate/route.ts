import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { productListTag, productTag } from "@/commerce/catalog/queries";
import {
  hubCatalogTag,
  hubCategoryTag,
  hubProductTag,
} from "@/commerce/hub/queries";
import { revalidateSecret } from "@/lib/env";

/**
 * Catalog invalidation webhook, called by the backend on publish.
 *
 * This endpoint is the hard dependency behind catalog caching
 * (docs/architecture.md §9). Without it the only honest options are a stale
 * catalog or no catalog caching at all.
 *
 * It is authenticated with a shared secret compared in constant time. A public
 * endpoint that can flush the catalog cache is a free denial-of-service lever:
 * an attacker hammering it forces every request to miss and hit the backend.
 */

/**
 * Constant-time comparison over SHA-256 digests.
 *
 * Hashing first is what makes this safe for inputs of differing length: digests
 * are always 32 bytes, so `timingSafeEqual` never throws and the comparison
 * leaks nothing about the length of the real secret. The previous hand-rolled
 * loop early-returned on a length mismatch, which made the secret's length
 * observable — a small leak, but a free one to remove, and hand-rolling a
 * comparison when the platform provides one is not worth defending.
 */
function secretMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/** One request names a price change or an import batch, not the catalogue. */
const MAX_HUB_KEYS = 1000;

/**
 * HUB's half of the body: `{ hub: { products, categories, all } }`.
 *
 * `products` are skus, the name for a product both sides agree on — the read
 * path tags every cached product with the sku HUB returned. `all` flushes
 * everything read from HUB, for a bulk import rather than one price.
 *
 * Documented for HUB in docs/hub-api-gaps.md §2.1.
 */
function revalidateHub(hub: unknown) {
  const body = (hub ?? {}) as {
    products?: unknown;
    categories?: unknown;
    all?: unknown;
  };

  const products = (Array.isArray(body.products) ? body.products : [])
    .filter((sku): sku is string => typeof sku === "string" && sku !== "")
    .slice(0, MAX_HUB_KEYS);
  const categories = (Array.isArray(body.categories) ? body.categories : [])
    .filter((id): id is number => Number.isSafeInteger(id) && id > 0)
    .slice(0, MAX_HUB_KEYS);
  const all = body.all === true;

  for (const sku of products) revalidateTag(hubProductTag(sku), "max");
  for (const id of categories) revalidateTag(hubCategoryTag(id), "max");
  if (all) revalidateTag(hubCatalogTag, "max");

  return { products: products.length, categories: categories.length, all };
}

export async function POST(request: Request) {
  const configured = revalidateSecret();

  if (configured.state !== "ok") {
    // Both "absent" and "too short" answer identically to the caller: a prober
    // must not learn which. The distinction is logged, without the value, so an
    // operator can see that a secret was rejected rather than missing.
    if (configured.state === "too_short") {
      console.warn(
        JSON.stringify({
          event: "revalidate_secret_rejected",
          reason: "too_short",
          length: configured.length,
        }),
      );
    }
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-revalidate-secret") ?? "";
  if (!secretMatches(provided, configured.secret)) {
    // Deliberately no detail: never help a caller distinguish "wrong secret"
    // from "endpoint disabled".
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  /*
    A call about HUB alone leaves the provisional catalogue's cache untouched:
    flushing its listing on every HUB price change would send that load to an
    API the change has nothing to do with.
  */
  const hub = (body as { hub?: unknown } | null)?.hub;
  const hubOnly =
    hub !== undefined && (body as { slugs?: unknown }).slugs === undefined;
  if (hubOnly) return Response.json({ hub: revalidateHub(hub) });

  const slugs = Array.isArray((body as { slugs?: unknown })?.slugs)
    ? ((body as { slugs: unknown[] }).slugs.filter(
        (s): s is string => typeof s === "string",
      ) ?? [])
    : [];

  // 'max' gives the longest stale-while-revalidate window: shoppers keep seeing
  // the cached shell while the new one builds, instead of stampeding the API.
  for (const slug of slugs) {
    revalidateTag(productTag(slug), "max");
  }
  revalidateTag(productListTag, "max");
  // What production has done since the HUB-only build: a call without a `hub`
  // object is how the HUB catalogue was flushed before that object existed.
  revalidateTag(hubCatalogTag, "max");

  return Response.json({
    revalidated: slugs.length,
    listRevalidated: true,
    ...(hub === undefined ? {} : { hub: revalidateHub(hub) }),
  });
}
