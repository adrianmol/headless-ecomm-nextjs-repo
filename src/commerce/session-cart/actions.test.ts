import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { resetHubConfigCache } from "@/lib/env";
import { placeSessionOrderAction } from "./actions";
import { readCartLines, readLastOrder, writeCartLines } from "./cart";

const HUB = "https://hub.test";
const EMAIL = "https://email.test/emails";
const ORDER_KEY = "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";

/** 66 RON a unit, 2 in the cart: the page showed 13200. */
function liveHandler(value = 66) {
  return http.get(`${HUB}/hub-api/v1/live`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        products: [
          {
            id: 1,
            sku: "A",
            price: {
              value,
              special: null,
              currency: "RON",
              tax_included: true,
              show: true,
            },
            stock: { state: "stoc", label: "", orderable: true, quantity: 5 },
          },
        ],
        missing: [],
      },
    }),
  );
}

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const fields = {
    email: "client@example.test",
    name: "Ion Popescu",
    phone: "+40 700 000 000",
    line1: "Str. Test 1",
    city: "Cluj",
    postcode: "400000",
    country: "RO",
    county: "Cluj",
    expectedTotal: "13200",
    orderKey: ORDER_KEY,
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const place = (data = form()) =>
  placeSessionOrderAction({ status: "idle" }, data);

describe("placeSessionOrderAction", () => {
  let emails: { headers: Headers; body: Record<string, unknown> }[];

  beforeEach(async () => {
    resetHubConfigCache();
    process.env.HUB_API_URL = HUB;
    process.env.HUB_API_KEY = "hk_testkey0000";
    process.env.HUB_API_SECRET = "s".repeat(64);
    process.env.RESEND_API_KEY = "re_test";
    process.env.ORDER_EMAIL_FROM = "shop@example.test";
    process.env.ORDER_EMAIL_TO = "orders@example.test";
    process.env.ORDER_EMAIL_API_URL = EMAIL;

    emails = [];
    server.use(
      liveHandler(),
      http.post(EMAIL, async ({ request }) => {
        emails.push({
          headers: request.headers,
          body: (await request.json()) as Record<string, unknown>,
        });
        return HttpResponse.json({ id: "e1" });
      }),
    );
    await writeCartLines([{ sku: "A", name: "Toner A", quantity: 2 }]);
  });

  afterEach(() => {
    for (const key of [
      "HUB_API_URL",
      "HUB_API_KEY",
      "HUB_API_SECRET",
      "RESEND_API_KEY",
      "ORDER_EMAIL_FROM",
      "ORDER_EMAIL_TO",
      "ORDER_EMAIL_API_URL",
    ]) {
      delete process.env[key];
    }
    resetHubConfigCache();
  });

  it("emails the shop once, then records the order and clears the cart", async () => {
    await expect(place()).rejects.toMatchObject({
      digest: expect.stringContaining("/comenzi/0F1E2D3C"),
    });

    // The shop's email first — that is the order — then the customer's copy.
    expect(emails).toHaveLength(2);
    const [shop, customer] = emails;
    expect(shop.headers.get("idempotency-key")).toBe(`order:${ORDER_KEY}`);
    expect(shop.body.to).toEqual(["orders@example.test"]);
    expect(shop.body.reply_to).toBe("client@example.test");
    expect(shop.body.text).toContain("2 x Toner A (A)");
    expect(shop.body.text).toContain("400000 Cluj, jud. Cluj, RO");
    expect(shop.body.text).toContain("Facturare: persoana fizica");
    expect(shop.body.text).toMatch(/Total: 132,00\sRON/);

    expect(customer.headers.get("idempotency-key")).toBe(
      `order:${ORDER_KEY}:customer`,
    );
    expect(customer.body.to).toEqual(["client@example.test"]);
    expect(customer.body.reply_to).toBe("orders@example.test");
    expect(customer.body.subject).toBe("Am primit comanda 0F1E2D3C — REPrint");
    expect(customer.body.text).toContain("te sunam la +40 700 000 000");

    expect(await readCartLines()).toEqual([]);
    expect(await readLastOrder()).toMatchObject({
      id: "0F1E2D3C",
      total: { amountMinor: 13200, currency: "RON" },
      confirmationSent: true,
    });
  });

  it("invoices a company when asked, with the CUI normalised", async () => {
    await expect(
      place(
        form({
          customerType: "pj",
          company: "Firma Test SRL",
          cui: "ro 123 456",
          regCom: "J12/345/2020",
        }),
      ),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/comenzi/") });

    expect(emails[0].body.text).toContain("Firma:        Firma Test SRL");
    expect(emails[0].body.text).toContain("CUI:          RO123456");
    expect(await readLastOrder()).toMatchObject({
      billing: { company: "Firma Test SRL", cui: "RO123456" },
    });
  });

  it("reports every missing field at once, including the conditional ones", async () => {
    // Zod skips object refinements while a field is invalid; the county and
    // company rules must not wait for the email typo to be fixed first.
    const state = await place(
      form({ email: "nope", county: "", customerType: "pj", cui: "12AB" }),
    );
    expect(state).toMatchObject({
      status: "invalid",
      fieldErrors: {
        email: "Introdu o adresa de email valida",
        county: "Alege judetul",
        company: "Introdu numele firmei",
        cui: "Introdu un CUI valid, de exemplu RO12345678",
      },
    });
    expect(emails).toHaveLength(0);
  });

  it("rejects a county that is not on the list, but only for Romania", async () => {
    expect(await place(form({ county: "Cluj-Napoca" }))).toMatchObject({
      status: "invalid",
      fieldErrors: { county: "Alege judetul" },
    });

    await expect(
      place(form({ country: "MD", county: "" })),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/comenzi/") });
  });

  it("still places the order when only the customer's copy fails", async () => {
    let calls = 0;
    server.use(
      http.post(EMAIL, () =>
        ++calls === 1
          ? HttpResponse.json({ id: "shop" })
          : new HttpResponse(null, { status: 500 }),
      ),
    );

    await expect(place()).rejects.toMatchObject({
      digest: expect.stringContaining("/comenzi/0F1E2D3C"),
    });
    expect(await readCartLines()).toEqual([]);
    expect(await readLastOrder()).toMatchObject({ confirmationSent: false });
  });

  it("stops on a price change, before anything is sent", async () => {
    server.use(liveHandler(70));

    expect(await place()).toMatchObject({ status: "price_changed" });
    expect(emails).toHaveLength(0);
    expect(await readCartLines()).toHaveLength(1);
  });

  it("keeps the cart when the email cannot be sent", async () => {
    server.use(http.post(EMAIL, () => new HttpResponse(null, { status: 500 })));

    expect(await place()).toMatchObject({ status: "error" });
    expect(await readCartLines()).toHaveLength(1);
    expect(await readLastOrder()).toBeNull();
  });

  it("refuses to place an order when email is unconfigured", async () => {
    delete process.env.RESEND_API_KEY;

    expect(await place()).toMatchObject({ status: "error" });
    expect(emails).toHaveLength(0);
    expect(await readCartLines()).toHaveLength(1);
  });

  it("requires a phone number and an order key", async () => {
    expect(await place(form({ phone: "" }))).toMatchObject({
      status: "invalid",
      fieldErrors: { phone: "Introdu numarul de telefon" },
    });
    expect(await place(form({ orderKey: "chosen" }))).toMatchObject({
      status: "error",
    });
  });

  it("echoes the customer's input back, but never the hidden fields", async () => {
    // React resets the form after every action; these refill it.
    const state = await place(form({ phone: "" }));
    expect(state.values).toMatchObject({
      email: "client@example.test",
      city: "Cluj",
      phone: "",
    });
    expect(state.values).not.toHaveProperty("orderKey");
    expect(state.values).not.toHaveProperty("expectedTotal");
  });
});
