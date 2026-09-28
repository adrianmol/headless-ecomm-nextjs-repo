import AxeBuilder from "@axe-core/playwright";
import { STOREFRONT_URL } from "../playwright.config";
import {
  HUB_COLLECTION,
  HUB_PRODUCT,
  HUB_PRODUCT_GONE,
  expect,
  test,
} from "./fixtures";

/**
 * The HUB catalogue pages, against the stand-in in scripts/mock-hub.mjs: the
 * product page (plan stage 3.3), the collection (3.2) and search by code (8).
 */

type Page = import("@playwright/test").Page;

/** Every structured-data block on the page, flattened through `@graph`. */
async function structuredData(page: Page) {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks
    .map((text) => JSON.parse(text))
    .flatMap((data) => data["@graph"] ?? [data]);
}

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

test.describe("HUB product page", () => {
  test("shows the price, cost per page and yield in the delivered HTML", async ({
    request,
  }) => {
    // Fetched, not rendered: the plan's rule is about what the server sends,
    // and a browser would hide a price that arrived by script.
    const html = await (await request.get(HUB_PRODUCT)).text();

    expect(html).toMatch(/66,00(\s|&nbsp;)RON/);
    // 66 RON over 2.000 pages.
    expect(html).toContain("3,30 bani / pagină");
    expect(html).toContain("2.000 pagini");
  });

  test("structured data states the same price and stock as the page", async ({
    page,
  }) => {
    await page.goto(HUB_PRODUCT);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const data = await structuredData(page);
    const product = data.find((d) => d["@type"] === "Product");

    expect(product.sku).toBe("HUB-TONER-1");
    expect(product.mpn).toBe("CF283A");
    expect(product.gtin).toBe("4960999681986");
    expect(product.offers).toMatchObject({
      price: "66.00",
      priceCurrency: "RON",
      availability: "https://schema.org/InStock",
      url: `${STOREFRONT_URL}${HUB_PRODUCT}`,
    });
    expect(product.isAccessoryOrSparePartFor).toEqual([
      { "@type": "Product", name: "HP LaserJet Pro M127fn" },
    ]);

    const trail = data.find((d) => d["@type"] === "BreadcrumbList");
    expect(
      trail.itemListElement.map((item: { name: string }) => item.name),
    ).toEqual([
      "Acasă",
      "Cartușe toner",
      "HP",
      "HP 83A",
      "Toner HUB test negru",
    ]);
  });

  test("a sold-out product is not advertised as available", async ({
    page,
  }) => {
    await page.goto(HUB_PRODUCT_GONE);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const product = (await structuredData(page)).find(
      (d) => d["@type"] === "Product",
    );
    expect(product.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  test("links every compatible printer to its collection", async ({ page }) => {
    await page.goto(HUB_PRODUCT);

    await page.getByRole("link", { name: "HP LaserJet Pro M127fn" }).click();
    await expect(page).toHaveURL(new RegExp(`${HUB_COLLECTION}$`));
  });

  test("lists the other manufacturers, out of stock included", async ({
    page,
  }) => {
    await page.goto(HUB_PRODUCT);

    const variants = page.getByRole("region", {
      name: "Același consumabil, alți producători",
    });
    // A chip, not a card: no second add-to-cart competing with the page's own.
    await expect(variants.getByRole("button")).toHaveCount(0);
    await expect(variants.getByRole("link")).toContainText("Stoc epuizat");
  });

  test("offers WhatsApp once, with the product already named", async ({
    page,
  }) => {
    await page.goto(HUB_PRODUCT);

    const link = page.getByRole("link", { name: /Discută pe WhatsApp/ });
    await expect(link).toHaveCount(1);

    const href = new URL((await link.getAttribute("href")) ?? "");
    expect(href.origin + href.pathname).toBe("https://wa.me/40700000000");
    expect(href.searchParams.get("text")).toBe(
      "Bună! Am o întrebare despre HUB-TONER-1 — Toner HUB test negru",
    );
  });

  test("adds the quantity that was asked for", async ({ page }) => {
    await page.goto(HUB_PRODUCT);
    await page.getByLabel("Cantitate").fill("2");
    await page.getByRole("button", { name: "Adauga in cos" }).click();
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();

    await page.goto("/cos");
    await expect(
      page.getByRole("listitem").getByText(/132,00\s*RON/),
    ).toBeVisible();
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto(HUB_PRODUCT);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });
});

test.describe("HUB collection", () => {
  test("groups the printer's products by type, in a table", async ({
    page,
  }) => {
    await page.goto(HUB_COLLECTION);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Consumabile pentru HP LaserJet Pro M127fn",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Cartușe toner HP LaserJet Pro M127fn (2)",
      }),
    ).toBeVisible();

    const row = page.getByRole("row", { name: /Toner HUB test negru/ });
    await expect(row).toContainText(/66,00\s*RON/);
    await expect(
      page
        .getByRole("row", { name: /Toner HUB test epuizat/ })
        .getByRole("button", { name: "Stoc epuizat" }),
    ).toBeDisabled();
  });

  test("adds to the cart from a row", async ({ page }) => {
    await page.goto(HUB_COLLECTION);

    await page
      .getByRole("row", { name: /Toner HUB test negru/ })
      .getByRole("button", { name: "Adaugă" })
      .click();

    await expect(page).toHaveURL(new RegExp(`${HUB_COLLECTION}$`));
    await expect(
      page.getByRole("status").filter({ hasText: "Adaugat in cos." }),
    ).toContainText("Toner HUB test negru");
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto(HUB_COLLECTION);
    await expect(page.getByRole("table")).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });
});

test.describe("search by code", () => {
  test("finds a product by its code, whatever the case and spacing", async ({
    page,
  }) => {
    await page.goto("/");
    const search = page.getByRole("search", {
      name: "Caută după codul produsului",
    });
    await search.getByRole("searchbox").fill("hub toner 1");
    await search.getByRole("button", { name: "Caută" }).click();

    await expect(page).toHaveURL(/\/cauta\?q=hub\+toner\+1$/);
    await expect(
      page.getByRole("article").filter({ hasText: "Toner HUB test negru" }),
    ).toBeVisible();
  });

  test("says what it cannot find, and offers the ways that work", async ({
    page,
  }) => {
    await page.goto("/cauta?q=CF283A");

    await expect(
      page.getByRole("heading", {
        name: "Nu am găsit niciun produs cu codul „CF283A”",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Caută după echipament" }),
    ).toHaveAttribute("href", "/modele");
    await expect(
      page.getByRole("link", { name: /Discută pe WhatsApp/ }),
    ).toHaveAttribute("href", /CF283A/);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    expect((await scan(page)).violations).toEqual([]);
  });
});

test.describe("cart", () => {
  test("offers WhatsApp with the cart's contents", async ({ page }) => {
    await page.goto(HUB_PRODUCT);
    await page.getByRole("button", { name: "Adauga in cos" }).click();
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();

    await page.goto("/cos");
    const link = page.getByRole("link", { name: /Discută pe WhatsApp/ });
    await expect(link).toHaveCount(1);
    expect(
      new URL((await link.getAttribute("href")) ?? "").searchParams.get("text"),
    ).toBe("Bună! Am o întrebare despre coșul meu: HUB-TONER-1 × 1");
  });
});
