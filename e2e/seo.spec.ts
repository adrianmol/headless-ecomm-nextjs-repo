import { test, expect } from "./fixtures";
import { STOREFRONT_URL } from "../playwright.config";

const productPath = "/produse/toner-compatibil-hp-35a-black-cb435a";
const productUrl = new URL(productPath, STOREFRONT_URL).toString();
const imageUrl = new URL("/img/toner.png", STOREFRONT_URL).toString();

test.describe("product detail metadata", () => {
  test("uses the configured public metadata origin for canonical, open graph, and twitter cards", async ({
    page,
  }) => {
    await page.goto(productPath);

    await expect(page).toHaveTitle(
      "Toner compatibil (2K) HP 35A Black (CB435A) | REPrint",
    );

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Cartus de toner compatibil pentru imprimante HP LaserJet. Randament 2.000 de pagini la acoperire 5% conform ISO/IEC 19752.",
    );

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      productUrl,
    );

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Toner compatibil (2K) HP 35A Black (CB435A)",
    );

    await expect(
      page.locator('meta[property="og:description"]'),
    ).toHaveAttribute(
      "content",
      "Cartus de toner compatibil pentru imprimante HP LaserJet. Randament 2.000 de pagini la acoperire 5% conform ISO/IEC 19752.",
    );

    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      productUrl,
    );

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      imageUrl,
    );

    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      "content",
      "Toner compatibil (2K) HP 35A Black (CB435A)",
    );

    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );

    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      "content",
      imageUrl,
    );
  });

  test("a missing product is noindex, with exactly one robots directive", async ({
    page,
  }) => {
    const response = await page.goto("/produse/no-such-product");

    // A soft 404: the shell is prerendered, so the status is already 200 by the
    // time we know the product is missing. That is why `noindex` is the thing
    // keeping it out of search results, and why this test matters.
    expect(response?.status()).toBe(200);

    const robots = page.locator('meta[name="robots"]');

    // Exactly one. This route previously emitted two — Next's automatic tag
    // plus an explicit one in not-found.tsx — which disagreed on `follow`.
    // Duplicated, conflicting directives are ambiguous to crawlers.
    await expect(robots).toHaveCount(1);
    await expect(robots).toHaveAttribute("content", /noindex/);

    // The escape link must stay crawlable: it points at a real page, so
    // `nofollow` here would be actively unhelpful.
    await expect(robots).not.toHaveAttribute("content", /nofollow/);
    await expect(
      page.getByRole("link", { name: "Vezi tot catalogul" }),
    ).toBeVisible();
  });
});

test.describe("robots.txt", () => {
  test("disallows the per-visitor and machine routes", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();

    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    // Basket, checkout and order pages are per-visitor, and an order URL in a
    // crawler's index is an order reference published to strangers.
    for (const path of [
      "/api/",
      "/health",
      "/cos",
      "/finalizare-comanda",
      "/comenzi/",
    ]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
  });

  test("points at the sitemap on the configured origin", async ({
    request,
  }) => {
    const body = await (await request.get("/robots.txt")).text();

    expect(body).toContain(`Sitemap: ${STOREFRONT_URL}/sitemap.xml`);
    // The regression this guards: robots.txt was prerendered, so it captured
    // whatever STOREFRONT_URL held at build time — and build:ci defaults it to
    // localhost, which would have advertised a localhost sitemap in production.
    expect(body).not.toContain("localhost");
  });
});

test.describe("sitemap.xml", () => {
  test("uses the configured origin rather than the build-time default", async ({
    request,
  }) => {
    const body = await (await request.get("/sitemap.xml")).text();

    const origins = [...body.matchAll(/<loc>(https?:\/\/[^/<]+)/g)].map(
      (m) => m[1],
    );
    expect(origins.length).toBeGreaterThan(0);
    // Exactly one origin, and it is the configured one. Before the sitemap was
    // made request-time this asserted localhost, because the document was baked
    // at build.
    expect([...new Set(origins)]).toEqual([STOREFRONT_URL]);
  });

  test("lists the catalogue and omits everything per-visitor", async ({
    request,
  }) => {
    const body = await (await request.get("/sitemap.xml")).text();

    expect(body).toContain(`<loc>${STOREFRONT_URL}/</loc>`);
    expect(body).toContain(`<loc>${STOREFRONT_URL}/produse</loc>`);
    expect(body).toContain(`<loc>${STOREFRONT_URL}/categorii/tonere</loc>`);
    expect(body).toContain(`<loc>${productUrl}</loc>`);
    // The long tail worth indexing: "toner for HL-2130" is how this catalogue is
    // actually searched.
    expect(body).toMatch(/<loc>[^<]*\/compatibil\/brother\/[^<]+<\/loc>/);

    // Nothing session-scoped, matching robots.txt.
    expect(body).not.toContain("/cos");
    expect(body).not.toContain("/finalizare-comanda");
    expect(body).not.toContain("/comenzi");
    // Cursors are opaque backend tokens that decay into soft-404s.
    expect(body).not.toContain("cursor=");
  });
});
