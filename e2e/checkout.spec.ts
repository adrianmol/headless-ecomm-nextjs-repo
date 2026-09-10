import { test, expect } from "./fixtures";

async function addToBasket(page: import("@playwright/test").Page) {
  await page.goto("/produse/toner-compatibil-hp-35a-black-cb435a");
  await page.getByRole("button", { name: "Adauga in cos" }).click();
  await expect(page.getByText("Adaugat in cos.")).toBeVisible();
}

test.describe("checkout", () => {
  test("completes the full redirect round trip", async ({ page }) => {
    await addToBasket(page);

    await page.goto("/finalizare-comanda");
    await page.getByLabel("Email").fill("shopper@example.test");
    await page.getByLabel("Nume complet").fill("A Shopper");
    await page.getByLabel("Adresa").fill("1 Test Street");
    await page.getByLabel("Oras").fill("Dublin");
    await page.getByLabel("Cod postal").fill("D01 AB12");
    await page.getByLabel("Cod tara").fill("IE");

    await page.getByRole("button", { name: "Continua spre plata" }).click();

    // We have genuinely left the storefront for the payment provider.
    await expect(
      page.getByRole("heading", { name: "Mock payment provider" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Pay and return" }).click();

    // Payment has not settled yet, so the honest answer is "confirming",
    // never a claim of success.
    await expect(
      page.getByRole("heading", { name: "Confirmam plata" }),
    ).toBeVisible();

    // Polling resolves it without the shopper doing anything.
    await expect(
      page.getByRole("heading", { name: /comanda ta este confirmata/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/34,00\s*RON/)).toBeVisible();
  });

  test("ignores forged success parameters on the return URL", async ({
    page,
  }) => {
    await addToBasket(page);

    await page.goto("/finalizare-comanda");
    await page.getByLabel("Email").fill("shopper@example.test");
    await page.getByLabel("Nume complet").fill("A Shopper");
    await page.getByLabel("Adresa").fill("1 Test Street");
    await page.getByLabel("Oras").fill("Dublin");
    await page.getByLabel("Cod postal").fill("D01 AB12");
    await page.getByLabel("Cod tara").fill("IE");
    await page.getByRole("button", { name: "Continua spre plata" }).click();

    await expect(
      page.getByRole("heading", { name: "Mock payment provider" }),
    ).toBeVisible();

    // The shopper edits the URL to claim the payment succeeded. The storefront
    // must ask its own backend instead of believing them; trusting this is how
    // a storefront gives away products.
    await page.getByRole("link", { name: /forged success params/i }).click();

    await expect(
      page.getByRole("heading", { name: "Confirmam plata" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/comenzi\//);
  });

  test("a cancelled payment returns the shopper to checkout, uncharged", async ({
    page,
  }) => {
    await addToBasket(page);

    await page.goto("/finalizare-comanda");
    await page.getByLabel("Email").fill("shopper@example.test");
    await page.getByLabel("Nume complet").fill("A Shopper");
    await page.getByLabel("Adresa").fill("1 Test Street");
    await page.getByLabel("Oras").fill("Dublin");
    await page.getByLabel("Cod postal").fill("D01 AB12");
    await page.getByLabel("Cod tara").fill("IE");
    await page.getByRole("button", { name: "Continua spre plata" }).click();

    await page.getByRole("link", { name: "Cancel payment" }).click();

    await expect(page.getByText(/Plata nu a fost finalizata/)).toBeVisible();
    await expect(page.getByText(/nicio suma/)).toBeVisible();
  });

  test("rejects an invalid email without leaving the site", async ({
    page,
  }) => {
    await addToBasket(page);

    await page.goto("/finalizare-comanda");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Nume complet").fill("A Shopper");
    await page.getByLabel("Adresa").fill("1 Test Street");
    await page.getByLabel("Oras").fill("Dublin");
    await page.getByLabel("Cod postal").fill("D01 AB12");
    await page.getByLabel("Cod tara").fill("IE");
    await page.getByRole("button", { name: "Continua spre plata" }).click();

    await expect(
      page.getByText("Introdu o adresa de email valida"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/finalizare-comanda$/);
  });

  test("an empty basket cannot be checked out", async ({ page }) => {
    await page.goto("/finalizare-comanda");
    await expect(
      page.getByText(/Cosul tau este gol, asa ca nu ai ce comanda/),
    ).toBeVisible();
  });
});
