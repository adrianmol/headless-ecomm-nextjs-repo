import { test, expect } from "./fixtures";
import { MOCK_API_URL } from "../playwright.config";

/**
 * Health endpoints, against the standalone production server the container runs.
 *
 * The failure classifications live in src/commerce/health.test.ts, because the
 * mock backend is always up here and a 503 is not reachable. What is worth
 * asserting against the real server is the contract: the status codes the
 * pipeline keys on, that nothing is cached, and that an unauthenticated endpoint
 * discloses nothing about configuration.
 */
test.describe("health endpoints", () => {
  test("/health reports liveness without touching anything", async ({
    request,
  }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });

    // A cached liveness answer would outlive the process it describes.
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("/health/ready reports backend reachability", async ({ request }) => {
    const response = await request.get("/health/ready");

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.status).toBe("ready");
    expect(body.dependencies.commerceApi.reachable).toBe(true);
    expect(typeof body.dependencies.commerceApi.latencyMs).toBe("number");

    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("neither endpoint discloses the backend address", async ({
    request,
  }) => {
    // These are unauthenticated and reachable by anything that can route to the
    // container. The commerce API is on a private network (ADR-0001) and its
    // address is not something a prober should be able to learn.
    const host = new URL(MOCK_API_URL).host;

    for (const path of ["/health", "/health/ready"]) {
      const text = await (await request.get(path)).text();
      expect(text, `${path} leaked the upstream host`).not.toContain(host);
      expect(text).not.toContain("127.0.0.1");
      expect(text).not.toContain("COMMERCE_API_URL");
      // No version, build id or hostname either — all of it is reconnaissance.
      expect(text).not.toMatch(/node|next|v?\d+\.\d+\.\d+/i);
    }
  });

  test("liveness does not depend on the backend, readiness does", async ({
    request,
  }) => {
    // The distinction the pipeline needs. Asserted structurally here: liveness
    // returns a fixed body with no dependency section at all, so it cannot fail
    // for a reason a restart would not fix. Proven by measurement rather than
    // inference: with the commerce API stopped on 2026-09-04, `/`, `/produse`
    // and `/produse/toner-compatibil-hp-35a-black-cb435a` all still returned 200, which is why the
    // pipeline could not detect an unreachable backend.
    //
    // Re-measured on 2026-09-13, because `/` has since gained a request-time
    // product band and is no longer fully static. Against a closed port it still
    // served 200 with the hero, printer finder and brand chips intact, the band
    // simply absent, and no client-side rendering error. The property that made
    // this endpoint necessary therefore still holds.
    const live = await (await request.get("/health")).json();
    const ready = await (await request.get("/health/ready")).json();

    expect(live).not.toHaveProperty("dependencies");
    expect(ready).toHaveProperty("dependencies.commerceApi");
  });
});
