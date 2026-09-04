import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { productListTag, productTag } from "@/commerce/catalog/queries";
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

  return Response.json({ revalidated: slugs.length, listRevalidated: true });
}
