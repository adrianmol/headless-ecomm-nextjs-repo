import { test, expect } from "./fixtures";

/**
 * This is the flow that unit tests declared healthy while it was completely
 * broken in a browser: the dev mock had no cart line routes, so every add
 * returned 404 and the storefront told shoppers their basket had expired.
 *
 * MSW covered those routes, so nothing failed. Only driving the real UI against
 * the real mock catches that class of bug.
 */
test.describe("cart", () => {
  test("adds a product and shows it in the basket", async ({ page }) => {
    await page.goto("/products/merino-crew");

    await expect(page.getByRole("button", { name: "Add to basket" })).toBeEnabled();
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByText("Merino Crew")).toBeVisible();
    await expect(page.getByRole("status", { name: "Quantity" })).toHaveText("1");
    // 8900 minor units, rendered by Intl.
    await expect(page.getByText("€89.00").first()).toBeVisible();
  });

  test("quantity stepper updates the server-rendered line total", async ({ page }) => {
    await page.goto("/products/merino-crew");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/cart");
    await page.getByRole("button", { name: "Increase quantity" }).click();

    // Optimistic: the count moves immediately, before any request completes.
    await expect(page.getByRole("status", { name: "Quantity" })).toHaveText("2");

    // Authoritative: money is recomputed by the backend and re-rendered, both
    // on the line and in the order summary. 2 x 8900 = 17800.
    //
    // Scoped by role rather than page-wide: the same amount legitimately
    // appears twice, and asserting both is a stronger check than either alone.
    await expect(
      page.getByRole("listitem").getByText("€178.00"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("complementary").getByText("€178.00"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("refuses to exceed available stock", async ({ page }) => {
    // The fixture has 4 in stock.
    await page.goto("/products/merino-crew");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/cart");
    const increase = page.getByRole("button", { name: "Increase quantity" });

    for (let i = 0; i < 5; i++) await increase.click();

    // Whatever the UI settles on, it must not claim more than exists.
    await expect(page.getByText(/Only 4 left/)).toBeVisible({ timeout: 10_000 });
  });

  test("removes a line", async ({ page }) => {
    await page.goto("/products/merino-crew");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/cart");
    await page.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByText("Your basket is empty.")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("out-of-stock product cannot be added", async ({ page }) => {
    await page.goto("/products/oxford-shirt");

    const button = page.getByRole("button", { name: "Out of stock" });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
  });
});
