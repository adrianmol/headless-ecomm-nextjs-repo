import {
  HUB_PRODUCT,
  HUB_PRODUCT_GONE,
  addHubProduct,
  expect,
  test,
} from "./fixtures";

/**
 * The session cart (src/commerce/session-cart), driven through the real UI
 * against the HUB stand-in in scripts/mock-hub.mjs. Prices on /cos come from
 * HUB's live endpoint on every render, never from the cookie.
 */
test.describe("cart", () => {
  test("adds from a listing card, past the stretched card link", async ({
    page,
  }) => {
    // The provisional /produse listing still writes to the commerce API cart.
    // Kept because it guards the card overlay, which HUB cards will inherit.
    await page.goto("/produse");

    const firstCard = page.getByRole("article").first();
    await firstCard.getByRole("button", { name: "Adauga in cos" }).click();

    await expect(page).toHaveURL(/\/produse$/);
    await expect(firstCard.getByText("Adaugat in cos.")).toBeVisible();
  });

  test("adds a HUB product and shows it in the basket", async ({ page }) => {
    await addHubProduct(page);

    await page.goto("/cos");
    await expect(page.getByText("Toner HUB test negru")).toBeVisible();
    await expect(page.getByRole("status", { name: "Cantitate" })).toHaveText(
      "1",
    );
    // Regex: Intl separates amount and currency with a non-breaking space.
    await expect(page.getByText(/66,00\s*RON/).first()).toBeVisible();
  });

  test("quantity stepper updates the server-rendered line total", async ({
    page,
  }) => {
    await addHubProduct(page);

    await page.goto("/cos");
    await page.getByRole("button", { name: "Creste cantitatea" }).click();
    await expect(page.getByRole("status", { name: "Cantitate" })).toHaveText(
      "2",
    );

    // 2 x 66 = 132, re-priced on the server — on the line and in the summary
    // (subtotal and total rows).
    await expect(
      page.getByRole("listitem").getByText(/132,00\s*RON/),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("complementary").getByText(/132,00\s*RON/),
    ).toHaveCount(2, { timeout: 10_000 });
  });

  test("cannot step past available stock", async ({ page }) => {
    // The mock product has 3 in stock.
    await addHubProduct(page);

    await page.goto("/cos");
    const increase = page.getByRole("button", { name: "Creste cantitatea" });
    for (let i = 0; i < 2; i++) await increase.click();

    await expect(page.getByRole("status", { name: "Cantitate" })).toHaveText(
      "3",
    );
    await expect(increase).toBeDisabled();
  });

  test("adding again beyond stock is capped and explained", async ({
    page,
  }) => {
    await page.goto(HUB_PRODUCT);
    const add = page.getByRole("button", { name: "Adauga in cos" });
    for (let i = 0; i < 4; i++) {
      await add.click();
      await expect(add).toBeEnabled();
    }
    await expect(page.getByText(/Au mai ramas doar 3/)).toBeVisible();
  });

  test("removes a line", async ({ page }) => {
    await addHubProduct(page);

    await page.goto("/cos");
    await page.getByRole("button", { name: "Sterge" }).click();

    await expect(page.getByText("Cosul tau este gol.")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("out-of-stock product cannot be added", async ({ page }) => {
    await page.goto(HUB_PRODUCT_GONE);

    const button = page.getByRole("button", { name: "Stoc epuizat" });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
  });
});
