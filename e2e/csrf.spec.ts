import {
  addHubProduct,
  expect,
  fillCheckout,
  sentEmails,
  test,
} from "./fixtures";

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
  await addHubProduct(page);

  await page.goto("/finalizare-comanda");
  await expect(
    page.getByRole("button", { name: "Plaseaza comanda" }),
  ).toBeVisible();
  await fillCheckout(page);

  // The progressive-enhancement encoding: the action id travels in the body, so
  // a hidden auto-submitting form on another origin is a real CSRF vector.
  return page.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) throw new Error("no checkout form found");
    // FormData, not a walk over `form.elements`: it applies the browser's own
    // submission rules, so of the two customerType radios only the checked
    // one is sent. The walk sent whichever came last, i.e. a company order.
    const fields: Record<string, string> = {};
    for (const [name, value] of new FormData(form)) {
      if (typeof value === "string") fields[name] = value;
    }
    return fields;
  });
}

test.describe("cross-origin mutation attempts", () => {
  test("a valid same-origin replay succeeds, which makes the rejections meaningful", async ({
    page,
    request,
    baseURL,
  }) => {
    const fields = await checkoutFormFields(page);

    const response = await page.request.post(`${baseURL}/finalizare-comanda`, {
      multipart: fields,
      headers: { origin: baseURL!, referer: `${baseURL}/` },
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    // 303 to the confirmation: the action ran, and the shop and the customer
    // were both emailed.
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toContain("/comenzi/");
    expect(await sentEmails(request)).toHaveLength(2);
  });

  for (const [label, headers] of [
    ["a foreign origin", { origin: "https://evil.test" }],
    ["the same host on a different port", { origin: "http://localhost:3199" }],
    ["a lookalike subdomain", { origin: "http://evil.localhost:3101" }],
    ["no Origin header at all", {}],
  ] as const) {
    test(`checkout is refused with ${label}`, async ({
      page,
      request,
      baseURL,
    }) => {
      const fields = await checkoutFormFields(page);

      const response = await page.request.post(
        `${baseURL}/finalizare-comanda`,
        {
          multipart: fields,
          headers,
          maxRedirects: 0,
          failOnStatusCode: false,
        },
      );

      // The security property is that no order was placed: nothing reached the
      // shop's inbox. Asserted that way rather than on a status code, because
      // Next answers a rejected action with a 500 while our own check returns a
      // rendered error state — both are refusals, and the test should not care
      // which layer refused.
      expect(response.status()).not.toBe(303);
      expect(response.headers()["location"] ?? "").not.toContain("/comenzi/");
      expect(await sentEmails(request)).toHaveLength(0);
    });
  }

  test("the shopper's own checkout still works after all that", async ({
    page,
  }) => {
    // Guards against the obvious over-correction: a check so strict that the
    // real browser flow is blocked too.
    await addHubProduct(page);

    await page.goto("/finalizare-comanda");
    await fillCheckout(page);
    await page.getByRole("button", { name: "Plaseaza comanda" }).click();

    await expect(
      page.getByRole("heading", { name: /am primit comanda/i }),
    ).toBeVisible();
  });
});
