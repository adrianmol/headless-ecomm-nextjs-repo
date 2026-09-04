import { describe, expect, it } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { API_BASE, errorBody } from "@/mocks/handlers";
import { probeCommerceApi } from "./health";

/**
 * These cover the classification, which is the part with judgement in it. The
 * happy path is also asserted end-to-end by e2e/health.spec.ts against the
 * standalone production server; a 503 is impractical there because the mock
 * backend is always running, which is exactly why the failure cases live here.
 */
describe("probeCommerceApi", () => {
  it("reports reachable with a latency when the backend answers", async () => {
    const result = await probeCommerceApi();

    expect(result.reachable).toBe(true);
    if (result.reachable) {
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.latencyMs)).toBe(true);
    }
  });

  it("treats a reachable-but-failing backend as not ready", async () => {
    // The distinction that matters: the socket opened, so a naive probe would
    // call this healthy while every catalog read on the site fails.
    server.use(
      http.get(`${API_BASE}/products`, () =>
        HttpResponse.json(errorBody("unavailable", "upstream is unwell"), {
          status: 500,
        }),
      ),
    );

    expect(await probeCommerceApi()).toEqual({
      reachable: false,
      reason: "rejected",
    });
  });

  it("classifies a hung backend as a timeout rather than hanging with it", async () => {
    server.use(
      http.get(`${API_BASE}/products`, async () => {
        await delay(200);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    // 10 ms bound against a 200 ms stall: the probe must give up.
    expect(await probeCommerceApi(10)).toEqual({
      reachable: false,
      reason: "timeout",
    });
  });

  it("classifies a refused connection as unreachable", async () => {
    server.use(http.get(`${API_BASE}/products`, () => HttpResponse.error()));

    expect(await probeCommerceApi()).toEqual({
      reachable: false,
      reason: "unreachable",
    });
  });

  it("never surfaces upstream error detail", async () => {
    // An unauthenticated probe must not become a window onto internal
    // hostnames, ports or stack traces.
    const secret = "internal-commerce.svc.cluster.local:8080";
    server.use(
      http.get(`${API_BASE}/products`, () =>
        HttpResponse.json(errorBody("unavailable", `cannot reach ${secret}`), {
          status: 502,
        }),
      ),
    );

    const result = await probeCommerceApi();

    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("cluster.local");
    expect(result).toEqual({ reachable: false, reason: "rejected" });
  });
});
