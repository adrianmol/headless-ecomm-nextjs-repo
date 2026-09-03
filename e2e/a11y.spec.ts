import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

/**
 * Accessibility carries real legal exposure on a storefront, and the risk
 * concentrates in the interactive leaves — steppers, add-to-cart, forms —
 * which is exactly where hand-rolled markup tends to live.
 *
 * Scoped to WCAG 2 A/AA. Scanning for every possible rule produces noise that
 * gets ignored, which is worse than a smaller set that stays green.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

test.describe("accessibility", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "Featured" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("global not-found page", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("product listing", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "All products" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("product detail, after price has streamed in", async ({ page }) => {
    await page.goto("/products/merino-crew");
    // Scanning before the streamed offer arrives would miss the add-to-cart
    // control entirely, which is the most interactive thing on the page.
    await expect(page.getByRole("button", { name: "Add to basket" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("basket with a line in it", async ({ page }) => {
    await page.goto("/products/merino-crew");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByRole("status", { name: "Quantity" })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("checkout form", async ({ page }) => {
    await page.goto("/products/merino-crew");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/checkout");
    await expect(page.getByLabel("Email")).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test("checkout form with validation errors showing", async ({ page }) => {
    // Error states are where labelling and aria-describedby usually break.
    await page.goto("/products/merino-crew");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/checkout");
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });
});
