import { test, expect } from "./fixtures";

test.describe("landing page", () => {
  test("shows the hero and featured products from the catalogue", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: /shop the collection/i }),
    ).toBeVisible();

    // Featured products come from the real catalog query, not hardcoded copy.
    await expect(page.getByRole("heading", { level: 2, name: "Featured" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Merino Crew/ })).toBeVisible();
  });

  test("the primary call to action reaches the listing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Shop all products" }).click();

    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole("heading", { level: 1, name: "All products" })).toBeVisible();
  });

  test("a featured product links through to its detail page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Merino Crew/ }).first().click();

    await expect(page).toHaveURL(/\/products\/merino-crew$/);
    await expect(page.getByRole("button", { name: "Add to basket" })).toBeVisible();
  });
});

test.describe("site header", () => {
  test("navigates between Home, Products and Basket", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });

    await nav.getByRole("link", { name: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);

    await nav.getByRole("link", { name: "Basket" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { level: 1, name: "Basket" })).toBeVisible();

    await nav.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the skip link is first and actually moves focus past the nav", async ({
    page,
  }) => {
    // Without this, every keyboard user tabs the whole nav on every navigation.
    await page.goto("/products");
    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toHaveText("Skip to content");

    await focused.press("Enter");

    // The fragment alone proves nothing: a non-focusable target leaves focus in
    // the header, so the skip link would look right and do nothing. Assert the
    // focus actually landed on the content container.
    await expect(page).toHaveURL(/#content$/);
    await expect(page.locator("#content")).toBeFocused();

    // And that tabbing on from there enters the page, not the nav again.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("navigation", { name: "Main" })).not.toContainText(
      await page.locator(":focus").innerText(),
    );
  });

  test("is present on every customer-facing route", async ({ page }) => {
    for (const path of ["/", "/products", "/products/merino-crew", "/cart", "/checkout"]) {
      await page.goto(path);
      await expect(
        page.getByRole("navigation", { name: "Main" }),
        `header missing on ${path}`,
      ).toBeVisible();
    }
  });
});

test.describe("global not-found", () => {
  test("an unknown URL renders the 404 page, not a crash", async ({ page }) => {
    const response = await page.goto("/no-such-page");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: /couldn't find that page/i }),
    ).toBeVisible();
    // Still navigable rather than a dead end.
    await expect(page.getByRole("link", { name: "Browse all products" })).toBeVisible();
  });
});
