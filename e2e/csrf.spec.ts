import { test, expect } from "./fixtures";

/**
 * Cross-origin mutation attempts, replayed against the standalone production
 * build.
 *
 * These exist because the framework default is necessary but not sufficient.
 * Next compares `Origin` to `Host` for Server Actions and rejects a mismatch —
 * but measured on 2026-09-04, a replay with **no** `Origin` header executed and
 * created an order. `src/lib/request-origin.ts` closes that, and this is the
 * test that proves the closure end to end rather than only in unit tests.
 *
 * The same-origin replay is part of the test on purpose: without it, a rejection
 * proves nothing, because a malformed request would also be rejected.
 */

async function checkoutFormFields(page: import("@playwright/test").Page) {
  await page.goto("/products/merino-crew");
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByText("Added to your basket.")).toBeVisible();

  await page.goto("/checkout");
  await expect(
    page.getByRole("button", { name: "Continue to payment" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill("shopper@example.test");
  await page.getByLabel("Full name").fill("A Shopper");
  await page.getByLabel("Address").fill("1 Test Street");
  await page.getByLabel("City").fill("Dublin");
  await page.getByLabel("Postcode").fill("D01");
  await page.getByLabel("Country code").fill("IE");

  // The progressive-enhancement encoding: the action id travels in the body, so
  // a hidden auto-submitting form on another origin is a real CSRF vector.
  return page.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) throw new Error("no checkout form found");
    const fields: Record<string, string> = {};
    for (const element of Array.from(form.elements)) {
      const input = element as HTMLInputElement;
      if (input.name) fields[input.name] = input.value ?? "";
    }
    return fields;
  });
}

test.describe("cross-origin mutation attempts", () => {
  test("a valid same-origin replay succeeds, which makes the rejections meaningful", async ({
    page,
    baseURL,
  }) => {
    const fields = await checkoutFormFields(page);

    const response = await page.request.post(`${baseURL}/checkout`, {
      multipart: fields,
      headers: { origin: baseURL!, referer: `${baseURL}/` },
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    // 303 to the payment provider: the action ran and created an order.
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toContain("/psp/pay?ref=");
  });

  for (const [label, headers] of [
    ["a foreign origin", { origin: "https://evil.test" }],
    ["the same host on a different port", { origin: "http://localhost:3199" }],
    ["a lookalike subdomain", { origin: "http://evil.localhost:3101" }],
    ["no Origin header at all", {}],
  ] as const) {
    test(`checkout is refused with ${label}`, async ({ page, baseURL }) => {
      const fields = await checkoutFormFields(page);

      const response = await page.request.post(`${baseURL}/checkout`, {
        multipart: fields,
        headers,
        maxRedirects: 0,
        failOnStatusCode: false,
      });

      // The security property is that no order was created, which shows up as
      // the absence of a redirect to the payment provider. Asserted that way
      // rather than on a status code, because Next answers a rejected action
      // with a 500 while our own check returns a rendered error state — both are
      // refusals, and the test should not care which layer refused.
      expect(response.status()).not.toBe(303);
      expect(response.headers()["location"] ?? "").not.toContain("/psp/pay");
      expect(await response.text()).not.toContain("/psp/pay");
    });
  }

  test("the shopper's own checkout still works after all that", async ({
    page,
  }) => {
    // Guards against the obvious over-correction: a check so strict that the
    // real browser flow is blocked too.
    await page.goto("/products/merino-crew");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    await page.goto("/checkout");
    await page.getByLabel("Email").fill("shopper@example.test");
    await page.getByLabel("Full name").fill("A Shopper");
    await page.getByLabel("Address").fill("1 Test Street");
    await page.getByLabel("City").fill("Dublin");
    await page.getByLabel("Postcode").fill("D01");
    await page.getByLabel("Country code").fill("IE");
    await page.getByRole("button", { name: "Continue to payment" }).click();

    await expect(
      page.getByRole("heading", { name: "Mock payment provider" }),
    ).toBeVisible();
  });
});
