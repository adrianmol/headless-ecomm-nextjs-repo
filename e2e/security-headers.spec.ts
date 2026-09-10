import { test, expect } from "./fixtures";

/**
 * Security headers, asserted against the standalone production server the
 * container actually runs — not against `next dev`, whose CSP is deliberately
 * looser.
 *
 * These are cheap to configure and easy to lose: a stray `headers()` edit, a
 * reverse proxy that strips or overrides, or a future `middleware.ts` can remove
 * them without any other test noticing. Hence assertions on the response rather
 * than on `next.config.ts`.
 */

/** Every route class: static shell, PPR, dynamic handler. */
const ROUTES = [
  "/",
  "/produse",
  "/produse/toner-compatibil-hp-35a-black-cb435a",
  "/cos",
];

function directive(csp: string, name: string) {
  const found = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found ?? null;
}

test.describe("security headers", () => {
  for (const route of ROUTES) {
    test(`${route} carries the security headers`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status()).toBe(200);
      const headers = response.headers();

      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers["permissions-policy"]).toContain("camera=()");

      // Only meaningful behind TLS, but it must be present in a production
      // build so the deployment does not have to remember to add it.
      expect(headers["strict-transport-security"]).toContain("max-age=");
      // `preload` is an effectively irreversible commitment and is deliberately
      // not set. If someone adds it, that should be a conscious decision.
      expect(headers["strict-transport-security"]).not.toContain("preload");

      const csp = headers["content-security-policy"];
      expect(csp, `no CSP on ${route}`).toBeTruthy();

      expect(directive(csp, "default-src")).toBe("default-src 'self'");
      expect(directive(csp, "object-src")).toBe("object-src 'none'");
      expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
      expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
      expect(directive(csp, "form-action")).toBe("form-action 'self'");

      // next/image proxies remote art through /_next/image on this origin, so
      // no external image host should be listed. If a raw <img> to a CDN is
      // ever introduced this fails, which is the point.
      expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob:");

      // The single most important assertion here: eval must never be reachable
      // in production. React Refresh needs it in development only.
      expect(csp).not.toContain("unsafe-eval");
    });
  }

  test("the API route is covered too, not just pages", async ({ request }) => {
    // A Route Handler is a response like any other and is a plausible XSS sink
    // if it ever returns HTML. 204 has no body but must still be governed.
    const response = await request.post("/api/vitals", {
      data: { name: "LCP", value: 1, path: "/" },
    });
    expect(response.status()).toBe(204);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["content-security-policy"]).toBeTruthy();
  });

  test("script-src allows inline but no foreign origin", async ({
    request,
  }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"];
    const scriptSrc = directive(csp, "script-src");

    // 'unsafe-inline' is a deliberate, documented trade: Next streams RSC
    // payloads as inline <script> blocks, and the strict alternative — a
    // per-request nonce — is silently incompatible with prerendered routes.
    // Measured: on static `/`, 12 of 12 inline scripts carry no nonce and would
    // all be blocked, while the build still reports the route as static. See
    // next.config.ts and docs/next-steps.md.
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-inline'");

    // What the policy must still guarantee: nothing executable from elsewhere.
    expect(scriptSrc).not.toMatch(/https?:/);
    expect(scriptSrc).not.toContain("*");
  });
});
