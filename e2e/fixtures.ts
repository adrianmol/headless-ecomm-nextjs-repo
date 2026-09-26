import { test as base, expect } from "@playwright/test";
import { MOCK_API_URL } from "../playwright.config";

/**
 * Resets the mock backend before every test.
 *
 * The mock keeps one global cart and caches idempotency keys, and the keys the
 * client derives from `useId` can repeat across tests. Without this, a basket
 * from one test silently becomes the starting state of the next.
 */
export const test = base.extend({
  page: async ({ page, request }, use) => {
    const response = await request.post(`${MOCK_API_URL}/__reset`);
    expect(response.ok(), "mock backend reset failed").toBe(true);
    await use(page);
  },
});

export { expect };

/** Served by scripts/mock-hub.mjs: 66 RON, 3 in stock. */
export const HUB_PRODUCT = "/produse-hub/toner-hub-test-negru";
/** Same mock, not orderable. */
export const HUB_PRODUCT_GONE = "/produse-hub/toner-hub-test-epuizat";

export async function addHubProduct(page: import("@playwright/test").Page) {
  await page.goto(HUB_PRODUCT);
  await page.getByRole("button", { name: "Adauga in cos" }).click();
  await expect(page.getByText("Adaugat in cos.")).toBeVisible();
}

export async function fillCheckout(
  page: import("@playwright/test").Page,
  overrides: { email?: string } = {},
) {
  await page.getByLabel("Email").fill(overrides.email ?? "client@example.test");
  await page.getByLabel("Nume complet").fill("Ion Popescu");
  await page.getByLabel("Telefon").fill("+40 700 000 000");
  await page.getByLabel("Adresa").fill("Str. Test 1");
  await page.getByLabel("Tara").selectOption("RO");
  await page.getByLabel("Oras").fill("Cluj");
  await page.getByLabel("Judet").selectOption("Cluj");
  await page.getByLabel("Cod postal").fill("400000");
}

/** Order emails the mock received since the last reset. */
export async function sentEmails(
  request: import("@playwright/test").APIRequestContext,
): Promise<{ to: string[]; subject: string; text: string }[]> {
  return (await request.get(`${MOCK_API_URL}/__email`)).json();
}
