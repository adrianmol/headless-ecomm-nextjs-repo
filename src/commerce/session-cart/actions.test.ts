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

    expect(emails).toHaveLength(1);
    expect(emails[0].headers.get("idempotency-key")).toBe(`order:${ORDER_KEY}`);
    expect(emails[0].body.reply_to).toBe("client@example.test");
    expect(emails[0].body.text).toContain("2 x Toner A (A)");
    expect(emails[0].body.text).toMatch(/Total: 132,00\sRON/);

    expect(await readCartLines()).toEqual([]);
    expect(await readLastOrder()).toMatchObject({
      id: "0F1E2D3C",
      total: { amountMinor: 13200, currency: "RON" },
    });
  });

  it("stops on a price change, before anything is sent", async () => {
    server.use(liveHandler(70));

    expect(await place()).toEqual({ status: "price_changed" });
    expect(emails).toHaveLength(0);
    expect(await readCartLines()).toHaveLength(1);
  });

  it("keeps the cart when the email cannot be sent", async () => {
    server.use(http.post(EMAIL, () => new HttpResponse(null, { status: 500 })));

    expect(await place()).toEqual({ status: "error" });
    expect(await readCartLines()).toHaveLength(1);
    expect(await readLastOrder()).toBeNull();
  });

  it("refuses to place an order when email is unconfigured", async () => {
    delete process.env.RESEND_API_KEY;

    expect(await place()).toEqual({ status: "error" });
    expect(emails).toHaveLength(0);
    expect(await readCartLines()).toHaveLength(1);
  });

  it("requires a phone number and an order key", async () => {
    expect(await place(form({ phone: "" }))).toMatchObject({
      status: "invalid",
      fieldErrors: { phone: "Introdu numarul de telefon" },
    });
    expect(await place(form({ orderKey: "chosen" }))).toEqual({
      status: "error",
    });
  });
});
