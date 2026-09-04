import { connection } from "next/server";

/**
 * Liveness probe. **Deliberately checks nothing.**
 *
 * The only question it answers is "is this process still serving HTTP?", and a
 * 200 from here means exactly that and nothing more. It touches no
 * configuration, no backend, and no cookies, so it cannot fail for a reason a
 * restart would not fix.
 *
 * That separation is the point. The container `HEALTHCHECK` and Docker's restart
 * policy act on this endpoint, and restarting the storefront does nothing
 * whatsoever about an unreachable commerce API — it just removes a working
 * process that was still serving cached catalog pages. Conflating the two turns
 * a backend incident into a restart loop.
 *
 * Backend reachability is `/health/ready`.
 *
 * Exposes no version, build id, hostname or configuration: this endpoint is
 * unauthenticated and reachable by anyone who can route to the container, so it
 * says the minimum that is useful.
 *
 * `await connection()` is load-bearing, not ceremony. Without it this handler
 * has no request-time input, so Next prerenders it and the build reports
 * `○ Static` — and a prerendered liveness response can be served by a CDN or
 * proxy while the origin is dead, which is the opposite of what the probe is
 * for. Opting into request-time evaluation means a 200 here proves this process
 * executed code just now.
 *
 * A route-segment `dynamic` export would be the other way to do it, but it is
 * rejected outright alongside `cacheComponents`.
 */
export async function GET() {
  await connection();

  return Response.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        // A cached liveness answer is worse than none: it would keep reporting
        // a healthy process after that process stopped being healthy.
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
