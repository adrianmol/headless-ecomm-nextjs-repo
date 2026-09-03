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
    await expect(page.getByRole("link", { name: "Next page" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Linen Shirt" }),
    ).not.toBeVisible();
  });

  test("navigates to the next page with the cursor", async ({ page }) => {
    await page.goto("/products");

    await page.getByRole("link", { name: "Next page" }).click();

    await page.waitForURL("/products?cursor=prod_2");
    await expect(page.getByRole("link", { name: "Linen Shirt" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cotton Tee" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next page" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Merino Crew" }),
    ).not.toBeVisible();
  });

  test("navigates to the odd-sized terminal page with no layout shift", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __layoutShifts: number[] }).__layoutShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) {
            (
              window as unknown as { __layoutShifts: number[] }
            ).__layoutShifts.push(shift.value);
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/products?cursor=prod_2");

    await expect(page.getByRole("link", { name: "Cotton Tee" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next page" })).toBeVisible();

    const clsBefore = await page.evaluate(() =>
      (window as unknown as { __layoutShifts: number[] }).__layoutShifts.reduce(
        (a, b) => a + b,
        0,
      ),
    );

    await page.getByRole("link", { name: "Next page" }).click();

    await page.waitForURL("/products?cursor=prod_4");
    await expect(page.getByRole("link", { name: "Wool Scarf" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Next page" }),
    ).not.toBeVisible();

    const clsAfter = await page.evaluate(() =>
      (window as unknown as { __layoutShifts: number[] }).__layoutShifts.reduce(
        (a, b) => a + b,
        0,
      ),
    );

    expect(clsAfter - clsBefore).toBeLessThan(0.01);
  });

  test("shows an empty page when the cursor is past the end", async ({
    page,
  }) => {
    await page.goto("/products?cursor=prod_5");

    await expect(
      page.getByRole("heading", { level: 1, name: "All products" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: /no more products/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Next page" }),
    ).not.toBeVisible();
  });

  test("renders a designed error for an invalid cursor", async ({ page }) => {
    await page.goto("/products?cursor=not-a-cursor");

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: /we couldn't load this page/i,
      }),
    ).toBeVisible();
    // Must never surface backend prose or codes to the customer.
    await expect(page.locator("body")).not.toContainText("validation_failed");
    await expect(page.locator("body")).not.toContainText("invalid cursor");
  });
});
