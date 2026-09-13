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
  test("adds from a listing card, past the stretched card link", async ({
    page,
  }) => {
    // The design puts add-to-cart on every card, and the whole card is already a
    // link via a stretched ::after overlay. Without `relative z-10` on the action
    // the overlay swallows the press and the click silently navigates to the PDP
    // instead of adding — a failure that looks like nothing happening. This is
    // the test that distinguishes the two.
    await page.goto("/produse");

    // Scoped to the card's <article>, not `getByRole("listitem").first()` —
    // that matched the header's category chip, which is also an <li>.
    const firstCard = page.getByRole("article").first();
    await expect(
      firstCard.getByRole("button", { name: "Adauga in cos" }),
    ).toBeEnabled();

    await firstCard.getByRole("button", { name: "Adauga in cos" }).click();

    // Still on the listing, and the basket took it.
    await expect(page).toHaveURL(/\/produse$/);
    await expect(firstCard.getByText("Adaugat in cos.")).toBeVisible();
  });

  test("adds a product and shows it in the basket", async ({ page }) => {
    await page.goto("/produse/toner-compatibil-hp-35a-black-cb435a");

    await expect(
      page.getByRole("button", { name: "Adauga in cos" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Adauga in cos" }).click();
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();

    await page.goto("/cos");
    await expect(page.getByText(/HP 35A Black/)).toBeVisible();
    await expect(page.getByRole("status", { name: "Cantitate" })).toHaveText(
      "1",
    );
    // 3400 minor units (34,00 lei), rendered by Intl for ro-RO. Matched by
    // regex because Intl separates amount and currency with a non-breaking
    // space, which is invisible and unreliable to paste into a test.
    await expect(page.getByText(/34,00\s*RON/).first()).toBeVisible();
  });

  test("quantity stepper updates the server-rendered line total", async ({
    page,
  }) => {
    await page.goto("/produse/toner-compatibil-hp-35a-black-cb435a");
    await page.getByRole("button", { name: "Adauga in cos" }).click();
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();

    await page.goto("/cos");
    await page.getByRole("button", { name: "Creste cantitatea" }).click();

    // Optimistic: the count moves immediately, before any request completes.
    await expect(page.getByRole("status", { name: "Cantitate" })).toHaveText(
      "2",
    );

    // Authoritative: money is recomputed by the backend and re-rendered, both
    // on the line and in the order summary. 2 x 3400 = 6800.
    //
    // Scoped by role rather than page-wide: the same amount legitimately
    // appears twice, and asserting both is a stronger check than either alone.
    await expect(
      page.getByRole("listitem").getByText(/68,00\s*RON/),
    ).toBeVisible({
      timeout: 10_000,
    });
    // Subtotal and Total are both 68,00 RON for this cart: the fixture backend
    // returns no shipping or tax, so the summary legitimately shows the same
    // figure on two rows. Asserting the count rather than visibility keeps that
    // explicit instead of quietly matching whichever row comes first.
    await expect(
      page.getByRole("complementary").getByText(/68,00\s*RON/),
    ).toHaveCount(2, { timeout: 10_000 });
  });

  test("refuses to exceed available stock", async ({ page }) => {
    // Brother TN 119 is the deliberately low-stock fixture: 3 units.
    await page.goto("/produse/toner-compatibil-brother-tn-119-black");
    await page.getByRole("button", { name: "Adauga in cos" }).click();
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();

    await page.goto("/cos");
    const increase = page.getByRole("button", { name: "Creste cantitatea" });

    for (let i = 0; i < 5; i++) await increase.click();

    // Whatever the UI settles on, it must not claim more than exists.
    await expect(page.getByText(/Au mai ramas doar 3/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("removes a line", async ({ page }) => {
    await page.goto("/produse/toner-compatibil-hp-35a-black-cb435a");
    await page.getByRole("button", { name: "Adauga in cos" }).click();
    await expect(page.getByText("Adaugat in cos.")).toBeVisible();

    await page.goto("/cos");
    await page.getByRole("button", { name: "Sterge" }).click();

    await expect(page.getByText("Cosul tau este gol.")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("out-of-stock product cannot be added", async ({ page }) => {
    await page.goto("/produse/toner-compatibil-hp-w1106a-black");

    const button = page.getByRole("button", { name: "Stoc epuizat" });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
  });
});
