import {
  HUB_PRODUCT,
  HUB_PRODUCT_GONE,
  HUB_SEARCH,
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
    // Confirmed by the site-wide toast, not inside the card.
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();
  });

  test("adds from a HUB product card, past the stretched card link", async ({
    page,
  }) => {
    // Searching the sold-out product's code lists the in-stock one beside it.
    await page.goto(HUB_SEARCH);
    const card = page
      .getByRole("article")
      .filter({ hasText: "Toner HUB test negru" });
    await card.getByRole("button", { name: "Adauga in cos" }).click();

    // Still on the same page: the button, not the card link, took the press.
    await expect(page).toHaveURL(/\/cauta\?q=/);
    const toast = page
      .getByRole("status")
      .filter({ hasText: "Adaugat in cos." });
    await expect(toast).toContainText("Toner HUB test negru");

    await toast.getByRole("link", { name: "Vezi cosul" }).click();
    await expect(page).toHaveURL(/\/cos$/);
    await expect(
      page.getByRole("link", { name: "Toner HUB test negru" }),
    ).toBeVisible();
  });

  test("the add-to-cart toast leads on to checkout", async ({ page }) => {
    await page.goto(HUB_PRODUCT);
    await page.getByRole("button", { name: "Adauga in cos" }).click();

    const toast = page
      .getByRole("status")
      .filter({ hasText: "Adaugat in cos." });
    await expect(toast).toContainText("Toner HUB test negru");
    await toast.getByRole("link", { name: "Finalizeaza comanda" }).click();
    await expect(page).toHaveURL(/\/finalizare-comanda$/);
  });

  test("the add-to-cart toast can be dismissed", async ({ page }) => {
    await page.goto(HUB_PRODUCT);
    const add = page.getByRole("button", { name: "Adauga in cos" });

    await add.click();
    await page.getByRole("button", { name: "Inchide notificarea" }).click();
    await expect(page.getByText("Adaugat in cos.")).toHaveCount(0);

    // Escape too, from anywhere on the page.
    await add.click();
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Adaugat in cos.")).toHaveCount(0);
  });

  test("the add-to-cart toast stays while it is being read", async ({
    page,
  }) => {
    await page.goto(HUB_PRODUCT);
    await page.getByRole("button", { name: "Adauga in cos" }).click();

    const toast = page.getByText("Adaugat in cos.");
    await toast.hover();
    // Past the 6s auto-dismiss: hovering holds it open (WCAG 2.2.1).
    await page.waitForTimeout(7000);
    await expect(toast).toBeVisible();
  });

  test("a sold-out HUB card shows why it cannot be added", async ({ page }) => {
    await page.goto(HUB_SEARCH);
    const card = page
      .getByRole("article")
      .filter({ hasText: "Toner HUB test epuizat" });
    await expect(
      card.getByRole("button", { name: "Stoc epuizat" }),
    ).toBeDisabled();
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
