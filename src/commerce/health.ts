import "server-only";
import { publicCommerceClient } from "./client";

/**
 * Readiness probe for the commerce API.
 *
 * Lives here, not in the Route Handler, because `src/commerce` is the only place
 * that talks to the backend. It uses the **session-free** client: a probe must
 * never depend on a visitor's cookies, and readiness is not per-user.
 *
 * It deliberately calls `GET /products?limit=1` rather than a dedicated backend
 * health endpoint, because the contract in `openapi/commerce.yaml` does not
 * define one. Asking for a `/health` the backend has never promised would be
 * inventing a contract. Recorded as a contract gap instead: a cheap, dedicated
 * readiness endpoint would be better than a catalog read, and should be
 * requested from the backend team.
 *
 * Not cached, and must never become cached — `use cache` here would report the
 * backend healthy from a stale entry long after it stopped answering, which is
 * the exact failure a readiness probe exists to prevent.
 */

/** Bounded so a hung upstream cannot hang the probe that is meant to detect it. */
const PROBE_TIMEOUT_MS = 2000;

export type CommerceApiStatus =
  | { reachable: true; latencyMs: number }
  | {
      reachable: false;
      reason: "timeout" | "unreachable" | "error" | "rejected";
    };

/**
 * @param timeoutMs Test seam only, matching the `reset*Cache` helpers elsewhere
 * in this directory. Production callers pass nothing so the bound stays a single
 * documented constant rather than something each caller can quietly widen.
 */
export async function probeCommerceApi(
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<CommerceApiStatus> {
  const startedAt = Date.now();

  try {
    const { response } = await publicCommerceClient().GET("/products", {
      params: { query: { limit: 1 } },
      signal: AbortSignal.timeout(timeoutMs),
    });

    // A reachable backend that answers 4xx/5xx is not a ready one. Treating any
    // response as success would make the probe report ready while every catalog
    // read fails, which is the same blindness this endpoint exists to remove.
    // The upstream status code is not surfaced to the caller — see below.
    if (!response.ok) return { reachable: false, reason: "rejected" };

    return { reachable: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    // Coarse classification only. The upstream error text is deliberately not
    // returned or logged: an unauthenticated probe endpoint must not become a
    // window onto internal hostnames, ports or stack traces.
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout"
        : error instanceof TypeError
          ? "unreachable"
          : "error";
    return { reachable: false, reason };
  }
}
