import { revalidateTag } from "next/cache";
import { productListTag, productTag } from "@/commerce/catalog/queries";

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-revalidate-secret") ?? "";
  if (!timingSafeEqual(provided, secret)) {
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
