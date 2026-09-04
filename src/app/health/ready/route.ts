import { probeCommerceApi } from "@/commerce/health";

/**
 * Readiness probe: can this instance actually serve a shopper?
 *
 * Distinct from `/health` on purpose. Liveness answers "is the process up" and
 * drives restarts; readiness answers "can it reach its backend" and should drive
 * load-balancer membership and deployment gates. A restart does not fix an
 * unreachable commerce API, so the two must not share an endpoint.
 *
 * **This is the check the delivery pipeline currently lacks.** Measured on
 * 2026-09-04 with the commerce API stopped: `/`, `/products` and
 * `/products/merino-crew` all returned 200, because the catalog shell is
 * prerendered. The container HEALTHCHECK, `deploy/deploy.sh`'s rollback gate and
 * the Jenkins post-deploy smoke test all target those URLs, so a storefront
 * deployed with a wrong `COMMERCE_API_URL` reports a successful deploy. Pointing
 * a gate here is what closes that hole; which gates should move is an owner
 * decision and is not changed unilaterally.
 *
 * Returns 503 when the backend is not reachable, so `curl -f` fails without the
 * caller having to parse the body.
 *
 * The body is intentionally coarse. This endpoint is unauthenticated, so it must
 * not disclose the upstream hostname, port, error text or stack — only whether
 * the dependency answered, and how quickly.
 *
 * No route-segment `dynamic` export — rejected alongside `cacheComponents`, and
 * redundant, since a handler with no `use cache` scope runs per request anyway.
 * `probeCommerceApi` must likewise never be wrapped in `use cache`, or this
 * would report health from a stale entry.
 */
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET() {
  const commerceApi = await probeCommerceApi();

  if (!commerceApi.reachable) {
    return Response.json(
      { status: "unavailable", dependencies: { commerceApi: commerceApi } },
      { status: 503, headers: NO_STORE },
    );
  }

  return Response.json(
    {
      status: "ready",
      dependencies: {
        commerceApi: {
          reachable: true,
          latencyMs: commerceApi.latencyMs,
        },
      },
    },
    { status: 200, headers: NO_STORE },
  );
}
