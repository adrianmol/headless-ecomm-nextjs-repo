import {
  addHubProduct,
  expect,
  fillCheckout,
  sentEmails,
  test,
} from "./fixtures";

/**
 * Session checkout: the order is emailed to the shop (the mock records it at
 * /__email) and kept in the session. No payment provider is involved.
 *
 * The PSP round trip — return handler, forged parameters, confirming screen —
 * is dormant until a payment provider exists; its tests went with it and belong
 * back here when it does.
 */
test.describe("checkout", () => {
  test("places an order, emails the shop and empties the basket", async ({
    page,
    request,
  }) => {
    await addHubProduct(page);

    await page.goto("/finalizare-comanda");
    await fillCheckout(page);
    await page.getByRole("button", { name: "Plaseaza comanda" }).click();

    await expect(
      page.getByRole("heading", { name: /am primit comanda/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/comenzi\/[0-9A-F]{8}$/);
    await expect(page.getByText(/66,00\s*RON/).first()).toBeVisible();
    await expect(page.getByText(/Nu ai platit nimic/)).toBeVisible();

    const orderId = page.url().split("/").pop()!;
    const emails = await sentEmails(request);
    expect(emails).toHaveLength(2);
    expect(emails[0].subject).toBe(`Comanda noua ${orderId}`);
    expect(emails[0].text).toContain("+40 700 000 000");
    expect(emails[0].text).toContain("jud. Cluj");
    expect(emails[0].text).toMatch(/Total: 66,00\sRON/);

    // The customer's own copy, and the page says it went.
    expect(emails[1].to).toEqual(["client@example.test"]);
    expect(emails[1].subject).toBe(`Am primit comanda ${orderId} — REPrint`);
    await expect(
      page.getByText(
        "Ti-am trimis confirmarea pe email la client@example.test.",
      ),
    ).toBeVisible();
    // Names are not stored in the order cookie; the page reads the catalogue.
    // Scoped: Next keeps the checkout page mounted, hidden, after navigating.
    await expect(
      page
        .getByRole("region", { name: "Produse comandate" })
        .getByText("Toner HUB test negru"),
    ).toBeVisible();

    await page.goto("/cos");
    await expect(page.getByText("Cosul tau este gol.")).toBeVisible();
  });

  test("invoices a company", async ({ page, request }) => {
    await addHubProduct(page);

    await page.goto("/finalizare-comanda");
    await fillCheckout(page);
    await page.getByRole("radio", { name: /Persoana juridica/ }).check();
    await page.getByLabel("Nume firma").fill("Firma Test SRL");
    // Exact: the "Persoana juridica" option's hint also mentions the CUI.
    await page.getByLabel("CUI", { exact: true }).fill("RO123456");
    await page.getByRole("button", { name: "Plaseaza comanda" }).click();

    await expect(
      page.getByText("Factura pe firma Firma Test SRL"),
    ).toBeVisible();
    const [shop] = await sentEmails(request);
    expect(shop.text).toContain("CUI:          RO123456");
  });

  test("asks for a company and CUI only when invoicing a company", async ({
    page,
  }) => {
    await addHubProduct(page);

    await page.goto("/finalizare-comanda");
    await expect(page.getByLabel("CUI", { exact: true })).toHaveCount(0);
    await page.getByRole("radio", { name: /Persoana juridica/ }).check();
    await page.getByRole("button", { name: "Plaseaza comanda" }).click();

    await expect(page.getByText("Introdu numele firmei")).toBeVisible();
    // By id: the county placeholder option carries the same words.
    await expect(page.locator("#county-error")).toHaveText("Alege judetul");
    // Still a company order after the post-action form reset.
    await expect(
      page.getByRole("radio", { name: /Persoana juridica/ }),
    ).toBeChecked();
  });

  test("offers a fix for a mistyped email domain", async ({ page }) => {
    await addHubProduct(page);

    await page.goto("/finalizare-comanda");
    const email = page.getByLabel("Email");
    await email.fill("ion@gmial.con");
    await email.blur();

    const fix = page.getByRole("button", { name: "ion@gmail.com" });
    await expect(fix).toBeVisible();
    await fix.click();
    await expect(email).toHaveValue("ion@gmail.com");
    await expect(fix).toHaveCount(0);
  });

  test("an order id from another session shows nothing", async ({ page }) => {
    await page.goto("/comenzi/DEADBEEF");
    await expect(
      page.getByRole("heading", { name: "Comanda nu a fost gasita" }),
    ).toBeVisible();
  });

  test("rejects an invalid email without sending anything", async ({
    page,
    request,
  }) => {
    await addHubProduct(page);

    await page.goto("/finalizare-comanda");
    await fillCheckout(page, { email: "not-an-email" });
    await page.getByRole("button", { name: "Plaseaza comanda" }).click();

    await expect(
      page.getByText("Introdu o adresa de email valida"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/finalizare-comanda$/);
    expect(await sentEmails(request)).toHaveLength(0);
  });

  test("an empty basket cannot be checked out", async ({ page }) => {
    await page.goto("/finalizare-comanda");
    await expect(
      page.getByText(/Cosul tau este gol, asa ca nu ai ce comanda/),
    ).toBeVisible();
  });
});
