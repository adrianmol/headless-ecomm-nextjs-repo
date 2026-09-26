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
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe(`Comanda noua ${orderId}`);
    expect(emails[0].text).toContain("+40 700 000 000");
    expect(emails[0].text).toMatch(/Total: 66,00\sRON/);

    await page.goto("/cos");
    await expect(page.getByText("Cosul tau este gol.")).toBeVisible();
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
