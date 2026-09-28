import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { probeCommerceApi } from "./health";
import { resetHubConfigCache } from "@/lib/env";

const hub = "https://hub.example.test";
afterEach(() => {
  vi.unstubAllEnvs();
  resetHubConfigCache();
});
function configure() {
  vi.stubEnv("STOREFRONT_BACKEND", "hub");
  vi.stubEnv("HUB_API_URL", hub);
  vi.stubEnv("HUB_API_KEY", "test-hub-key");
  vi.stubEnv("HUB_API_SECRET", "s".repeat(64));
  resetHubConfigCache();
}
describe("HUB storefront readiness", () => {
  it("requires a signed, valid HUB response without using the legacy API", async () => {
    configure();
    server.use(
      http.get(`${hub}/hub-api/v1/ping`, ({ request }) => {
        expect(request.headers.get("X-Api-Key")).toBe("test-hub-key");
        expect(request.headers.get("X-Signature")).toMatch(/^[a-f0-9]{64}$/);
        return HttpResponse.json({
          ok: true,
          data: { pong: true, time: "2026-09-26", shop_id: 1, scope: "read" },
        });
      }),
    );
    expect((await probeCommerceApi()).reachable).toBe(true);
  });
  it("fails closed when HUB rejects credentials", async () => {
    configure();
    server.use(
      http.get(`${hub}/hub-api/v1/ping`, () =>
        HttpResponse.json(
          { ok: false, error: { code: "unauthorized" } },
          { status: 401 },
        ),
      ),
    );
    expect((await probeCommerceApi()).reachable).toBe(false);
  });
  it("rejects a successful HTTP response with an invalid payload", async () => {
    configure();
    server.use(
      http.get(`${hub}/hub-api/v1/ping`, () =>
        HttpResponse.json({ ok: true, data: {} }),
      ),
    );
    expect((await probeCommerceApi()).reachable).toBe(false);
  });
});
