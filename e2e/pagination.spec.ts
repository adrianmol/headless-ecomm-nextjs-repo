import { test, expect } from "./fixtures";

/**
 * Pagination against the fixture catalog in `scripts/fixtures.mjs`: 17 products
 * at a page size of 12, so page one is full, page two is a short terminal page
 * of 5, and the odd size is what the layout-shift assertion below exercises.
 *
 * Products are addressed by title rather than position, so reordering the
 * fixtures does not silently change what these tests assert.
 */
const FIRST_ON_PAGE_1 = /HP 35A Black/;
const FIRST_ON_PAGE_2 = /Samsung MLT D1042S/;
const LAST_IN_CATALOG = /Rola de preluare hartie/;

/** The id of the last product on page one — the cursor the backend returns. */
const PAGE_2_CURSOR = "prod_12";
/** The id of the last product in the catalog: paging past it yields nothing. */
const PAST_END_CURSOR = "prod_17";

test.describe("product listing pagination", () => {
  test("shows the first page and a link to the next page", async ({ page }) => {
    await page.goto("/produse");

    await expect(
      page.getByRole("heading", { level: 1, name: "Toate produsele" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: FIRST_ON_PAGE_1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Pagina urmatoare" }),
    ).toBeVisible();

    // A product from page two must not leak onto page one.
    await expect(
      page.getByRole("link", { name: FIRST_ON_PAGE_2 }),
    ).not.toBeVisible();
  });

  test("navigates to the next page with the cursor", async ({ page }) => {
    await page.goto("/produse");

    await page.getByRole("link", { name: "Pagina urmatoare" }).click();

    await page.waitForURL(`/produse?cursor=${PAGE_2_CURSOR}`);
    await expect(
      page.getByRole("link", { name: FIRST_ON_PAGE_2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: FIRST_ON_PAGE_1 }),
    ).not.toBeVisible();
  });

  test("the odd-sized terminal page causes no layout shift", async ({
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

    await page.goto("/produse");

    await expect(
      page.getByRole("link", { name: FIRST_ON_PAGE_1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Pagina urmatoare" }),
    ).toBeVisible();

    const clsBefore = await page.evaluate(() =>
      (window as unknown as { __layoutShifts: number[] }).__layoutShifts.reduce(
        (a, b) => a + b,
        0,
      ),
    );

    await page.getByRole("link", { name: "Pagina urmatoare" }).click();

    await page.waitForURL(`/produse?cursor=${PAGE_2_CURSOR}`);
    await expect(
      page.getByRole("link", { name: LAST_IN_CATALOG }),
    ).toBeVisible();
    // Terminal page: no further pagination offered.
    await expect(
      page.getByRole("link", { name: "Pagina urmatoare" }),
    ).not.toBeVisible();

    const clsAfter = await page.evaluate(() =>
      (window as unknown as { __layoutShifts: number[] }).__layoutShifts.reduce(
        (a, b) => a + b,
        0,
      ),
    );

    expect(clsAfter - clsBefore).toBeLessThan(0.01);
  });

  test("shows an empty state when the cursor is past the end", async ({
    page,
  }) => {
    await page.goto(`/produse?cursor=${PAST_END_CURSOR}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Toate produsele" }),
    ).toBeVisible();
    await expect(page.getByText(/nu am gasit produse/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Pagina urmatoare" }),
    ).not.toBeVisible();
  });

  test("renders a designed error for an invalid cursor", async ({ page }) => {
    // The backend rejects the cursor. That must render a designed message with
    // a way back, not the route error boundary — a bad link is not an outage.
    await page.goto("/produse?cursor=not-a-cursor");

    await expect(
      page.getByText(/nu am putut incarca lista de produse/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Inapoi la prima pagina" }),
    ).toBeVisible();

    // Must never surface backend prose or codes to the customer.
    await expect(page.locator("body")).not.toContainText("validation_failed");
    await expect(page.locator("body")).not.toContainText("invalid cursor");
  });
});
