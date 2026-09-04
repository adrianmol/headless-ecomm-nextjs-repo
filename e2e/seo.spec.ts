import { test, expect } from "./fixtures";
import { STOREFRONT_URL } from "../playwright.config";

const productPath = "/products/merino-crew";
const productUrl = new URL(productPath, STOREFRONT_URL).toString();
const imageUrl = new URL("/img/merino-crew.png", STOREFRONT_URL).toString();

test.describe("product detail metadata", () => {
  test("uses the configured public metadata origin for canonical, open graph, and twitter cards", async ({
    page,
  }) => {
    await page.goto(productPath);

    await expect(page).toHaveTitle("Merino Crew | Storefront");

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "A mid-weight merino crew neck.",
    );

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      productUrl,
    );

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Merino Crew",
    );

    await expect(
      page.locator('meta[property="og:description"]'),
    ).toHaveAttribute("content", "A mid-weight merino crew neck.");

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
      "Merino Crew",
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
    const response = await page.goto("/products/no-such-product");

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
      page.getByRole("link", { name: "Browse all products" }),
    ).toBeVisible();
  });
});
