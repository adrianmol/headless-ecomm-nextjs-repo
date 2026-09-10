import { test, expect } from "./fixtures";

/** A stable in-stock fixture from scripts/fixtures.mjs. */
const PRODUCT_SLUG = "toner-compatibil-hp-35a-black-cb435a";
const PRODUCT_NAME = /HP 35A Black/;

test.describe("landing page", () => {
  test("leads with the printer finder", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: /consumabile compatibile/i }),
    ).toBeVisible();

    // The finder is the primary entry point for this catalog: shoppers arrive
    // knowing a printer, not a product.
    await expect(page.getByLabel("Marca imprimantei")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cauta" })).toBeVisible();
  });

  test("the model select is disabled until a brand is chosen", async ({
    page,
  }) => {
    await page.goto("/");

    // The two-step finder depends on this: with no brand there are no models to
    // offer, and an enabled-but-empty select would look broken.
    await expect(page.getByLabel("Modelul")).toBeDisabled();
  });

  test("the finder navigates to a brand's compatibility page", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByLabel("Marca imprimantei").selectOption("brother");
    await page.getByRole("button", { name: "Cauta" }).click();

    // Proves the whole no-JavaScript path: GET form -> redirect handler ->
    // canonical path URL.
    await expect(page).toHaveURL(/\/compatibil\/brother$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /imprimante Brother/i }),
    ).toBeVisible();
  });

  test("the finder reaches a specific model in two steps", async ({ page }) => {
    await page.goto("/compatibil/brother");

    // On the brand page the model select is populated server-side.
    await page.getByLabel("Modelul").selectOption("hl-2130");
    await page.getByRole("button", { name: "Cauta" }).click();

    await expect(page).toHaveURL(/\/compatibil\/brother\/hl-2130$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /Brother HL-2130/i }),
    ).toBeVisible();
  });

  test("category tiles reach a category listing", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("link", { name: "Tonere", exact: true })
      .first()
      .click();

    await expect(page).toHaveURL(/\/categorii\/tonere$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tonere" }),
    ).toBeVisible();
  });
});

test.describe("site header", () => {
  test("navigates between the catalogue and the basket", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Principal" });

    await nav.getByRole("link", { name: "Toate produsele" }).click();
    await expect(page).toHaveURL(/\/produse$/);

    await nav.getByRole("link", { name: "Cos" }).click();
    await expect(page).toHaveURL(/\/cos$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cosul meu" }),
    ).toBeVisible();
  });

  test("the category nav is present and links through", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Categorii de produse" });

    await nav.getByRole("link", { name: "Unitati cilindru" }).click();
    await expect(page).toHaveURL(/\/categorii\/unitati-cilindru$/);
  });

  test("the skip link is first and actually moves focus past the nav", async ({
    page,
  }) => {
    // Without this, every keyboard user tabs the whole nav on every navigation.
    await page.goto("/produse");

    // Wait for the streamed listing before touching the keyboard. The Suspense
    // fallback contains no focusable element, so tabbing past #content while it
    // is still showing moves focus out of the document entirely — which is what
    // made this test hang for 30 s rather than fail cleanly.
    await expect(
      page.getByRole("link", { name: PRODUCT_NAME }).first(),
    ).toBeVisible();

    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toHaveText("Sari la continut");

    await focused.press("Enter");

    // The fragment alone proves nothing: a non-focusable target leaves focus in
    // the header, so the skip link would look right and do nothing. Assert the
    // focus actually landed on the content container.
    await expect(page).toHaveURL(/#content$/);
    await expect(page.locator("#content")).toBeFocused();

    // And that tabbing on from there enters the page, not the nav again.
    await page.keyboard.press("Tab");
    const focusEscapedNav = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Principal"]');
      const active = document.activeElement;
      return {
        hasFocus: active !== null && active !== document.body,
        insideNav: !!(nav && active && nav.contains(active)),
      };
    });
    expect(focusEscapedNav.hasFocus).toBe(true);
    expect(focusEscapedNav.insideNav).toBe(false);
  });

  test("is present on every customer-facing route", async ({ page }) => {
    for (const path of [
      "/",
      "/produse",
      `/produse/${PRODUCT_SLUG}`,
      "/categorii/tonere",
      "/compatibil",
      "/compatibil/brother",
      "/compatibil/brother/hl-2130",
      "/info/seap",
      "/cos",
      "/finalizare-comanda",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("navigation", { name: "Principal" }),
        `header missing on ${path}`,
      ).toBeVisible();
    }
  });
});

test.describe("route error state", () => {
  // An error boundary is the one surface you cannot check by browsing, so
  // without fault injection it is only ever exercised during a real incident.
  test("a failing live offer renders the error UI, not a blank page", async ({
    page,
  }) => {
    // The product resolves; its offer returns 500. That is the degraded-backend
    // shape: cached shell fine, request-time pricing unavailable.
    await page.goto("/produse/force-error");

    await expect(
      page.getByRole("heading", { level: 1, name: /a aparut o eroare/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Incearca din nou" }),
    ).toBeVisible();

    // Must never surface backend prose to a customer.
    await expect(page.locator("body")).not.toContainText("injected fault");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("the error state offers a way out of the dead end", async ({ page }) => {
    await page.goto("/produse/force-error");
    await expect(
      page.getByRole("heading", { level: 1, name: /a aparut o eroare/i }),
    ).toBeVisible();

    await page
      .getByRole("link", { name: /vezi tot catalogul/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/produse$/);
  });
});

test.describe("global not-found", () => {
  test("an unknown URL renders the 404 page, not a crash", async ({ page }) => {
    const response = await page.goto("/no-such-page");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: /nu am gasit aceasta/i }),
    ).toBeVisible();
    // Still navigable rather than a dead end.
    await expect(
      page.getByRole("link", { name: "Vezi tot catalogul" }).first(),
    ).toBeVisible();
  });
});
