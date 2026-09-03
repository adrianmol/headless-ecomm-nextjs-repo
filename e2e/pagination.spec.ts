import { test, expect } from "./fixtures";

test.describe("product listing pagination", () => {
  test("shows the first page and a link to the next page", async ({ page }) => {
    await page.goto("/products");

    await expect(
      page.getByRole("heading", { level: 1, name: "All products" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Merino Crew" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Oxford Shirt" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Next page" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Linen Shirt" }),
    ).not.toBeVisible();
  });

  test("navigates to the next page with the cursor", async ({ page }) => {
    await page.goto("/products");

    await page.getByRole("link", { name: "Next page" }).click();

    await expect(page).toHaveURL(/\/products\?.*cursor=/);
    await expect(
      page.getByRole("link", { name: "Linen Shirt" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cotton Tee" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Merino Crew" }),
    ).not.toBeVisible();
  });

  test("shows the terminal page with no next link", async ({ page }) => {
    await page.goto("/products?cursor=prod_2");

    await expect(
      page.getByRole("heading", { level: 1, name: "All products" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Linen Shirt" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cotton Tee" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Next page" }),
    ).not.toBeVisible();
  });

  test("renders a designed error for an invalid cursor", async ({ page }) => {
    await page.goto("/products?cursor=not-a-cursor");

    await expect(
      page.getByRole("heading", { level: 2, name: /we couldn't load this page/i }),
    ).toBeVisible();
    // Must never surface backend prose or codes to the customer.
    await expect(page.locator("body")).not.toContainText("validation_failed");
    await expect(page.locator("body")).not.toContainText("invalid cursor");
  });
});
