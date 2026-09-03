import { test, expect } from "./fixtures";

async function addToBasket(page: import("@playwright/test").Page) {
  await page.goto("/products/merino-crew");
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByText("Added to your basket.")).toBeVisible();
}

test.describe("checkout", () => {
  test("completes the full redirect round trip", async ({ page }) => {
    await addToBasket(page);

    await page.goto("/checkout");
    await page.getByLabel("Email").fill("shopper@example.test");
    await page.getByLabel("Full name").fill("A Shopper");
    await page.getByLabel("Address").fill("1 Test Street");
    await page.getByLabel("City").fill("Dublin");
    await page.getByLabel("Postcode").fill("D01 AB12");
    await page.getByLabel("Country code").fill("IE");

    await page.getByRole("button", { name: "Continue to payment" }).click();

    // We have genuinely left the storefront for the payment provider.
    await expect(
      page.getByRole("heading", { name: "Mock payment provider" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Pay and return" }).click();

    // Payment has not settled yet, so the honest answer is "confirming",
    // never a claim of success.
    await expect(
      page.getByRole("heading", { name: "Confirming your payment" }),
    ).toBeVisible();

    // Polling resolves it without the shopper doing anything.
    await expect(
      page.getByRole("heading", { name: /your order is confirmed/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("€89.00")).toBeVisible();
  });

  test("ignores forged success parameters on the return URL", async ({
    page,
  }) => {
    await addToBasket(page);

    await page.goto("/checkout");
    await page.getByLabel("Email").fill("shopper@example.test");
    await page.getByLabel("Full name").fill("A Shopper");
    await page.getByLabel("Address").fill("1 Test Street");
    await page.getByLabel("City").fill("Dublin");
    await page.getByLabel("Postcode").fill("D01 AB12");
    await page.getByLabel("Country code").fill("IE");
    await page.getByRole("button", { name: "Continue to payment" }).click();

    await expect(
      page.getByRole("heading", { name: "Mock payment provider" }),
    ).toBeVisible();

    // The shopper edits the URL to claim the payment succeeded. The storefront
    // must ask its own backend instead of believing them; trusting this is how
    // a storefront gives away products.
    await page.getByRole("link", { name: /forged success params/i }).click();

    await expect(
      page.getByRole("heading", { name: "Confirming your payment" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/orders\//);
  });

  test("a cancelled payment returns the shopper to checkout, uncharged", async ({
    page,
  }) => {
    await addToBasket(page);

    await page.goto("/checkout");
    await page.getByLabel("Email").fill("shopper@example.test");
    await page.getByLabel("Full name").fill("A Shopper");
    await page.getByLabel("Address").fill("1 Test Street");
    await page.getByLabel("City").fill("Dublin");
    await page.getByLabel("Postcode").fill("D01 AB12");
    await page.getByLabel("Country code").fill("IE");
    await page.getByRole("button", { name: "Continue to payment" }).click();

    await page.getByRole("link", { name: "Cancel payment" }).click();

    await expect(
      page.getByText(/Your payment was not completed/),
    ).toBeVisible();
    await expect(page.getByText(/Nothing has been charged/)).toBeVisible();
  });

  test("rejects an invalid email without leaving the site", async ({
    page,
  }) => {
    await addToBasket(page);

    await page.goto("/checkout");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Full name").fill("A Shopper");
    await page.getByLabel("Address").fill("1 Test Street");
    await page.getByLabel("City").fill("Dublin");
    await page.getByLabel("Postcode").fill("D01 AB12");
    await page.getByLabel("Country code").fill("IE");
    await page.getByRole("button", { name: "Continue to payment" }).click();

    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test("an empty basket cannot be checked out", async ({ page }) => {
    await page.goto("/checkout");
    await expect(
      page.getByText(/Your basket is empty, so there is nothing to check out/),
    ).toBeVisible();
  });
});
