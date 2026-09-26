import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetCookies,
  __setCookie,
  cookies,
} from "@/test/stubs/next-headers";
import type { HubLiveEntry } from "../hub/queries";
import {
  priceLines,
  readCartLines,
  readLastOrder,
  writeCartLines,
  writeLastOrder,
  MAX_LINES,
} from "./cart";

const ron = (amountMinor: number) => ({ amountMinor, currency: "RON" });

function entry(
  sku: string,
  overrides: Partial<HubLiveEntry> = {},
): HubLiveEntry {
  return {
    id: 1,
    sku,
    offer: {
      price: ron(6600),
      promoPrice: null,
      vatIncluded: true,
      displayable: true,
    },
    stock: { state: "stoc", label: "In stoc", orderable: true, quantity: 5 },
    ...overrides,
  };
}

describe("priceLines", () => {
  it("prices from live data, preferring the promo price", () => {
    const cart = priceLines(
      [
        { sku: "A", name: "A", quantity: 2 },
        { sku: "B", name: "B", quantity: 1 },
      ],
      {
        entries: [
          entry("A"),
          entry("B", {
            offer: {
              price: ron(1000),
              promoPrice: ron(800),
              vatIncluded: true,
              displayable: true,
            },
          }),
        ],
        missing: [],
      },
    );

    expect(cart.lines.map((l) => l.lineTotal)).toEqual([ron(13200), ron(800)]);
    expect(cart.total).toEqual(ron(14000));
    expect(cart.lines[0].maxQuantity).toBe(5);
  });

  it("drops missing, unorderable and hidden-price lines from the total", () => {
    const cart = priceLines(
      [
        { sku: "GONE", name: "x", quantity: 1 },
        { sku: "NOSTOCK", name: "x", quantity: 1 },
        { sku: "HIDDEN", name: "x", quantity: 1 },
      ],
      {
        entries: [
          entry("NOSTOCK", {
            stock: {
              state: "nostoc",
              label: "",
              orderable: false,
              quantity: 0,
            },
          }),
          entry("HIDDEN", {
            offer: {
              price: ron(100),
              promoPrice: null,
              vatIncluded: true,
              displayable: false,
            },
          }),
        ],
        missing: ["GONE"],
      },
    );

    expect(cart.lines).toEqual([]);
    expect(cart.unavailable).toHaveLength(3);
    expect(cart.total).toBeNull();
  });
});

describe("session cookies", () => {
  beforeEach(() => __resetCookies());

  it("round-trips the cart", async () => {
    await writeCartLines([{ sku: "A", name: "Toner", quantity: 3 }]);
    expect(await readCartLines()).toEqual([
      { sku: "A", name: "Toner", quantity: 3 },
    ]);
  });

  it("reads a tampered cookie as empty, never as data", async () => {
    const forged = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");

    for (const raw of [
      "not base64 json",
      forged([{ sku: "A", name: "x", quantity: 1.5 }]),
      forged([{ sku: "A", name: "x", quantity: 1e9 }]),
      forged({ sku: "A" }),
    ]) {
      __setCookie("hub_cart", raw);
      expect(await readCartLines()).toEqual([]);
    }

    __setCookie("hub_order", forged({ id: "X", total: 5 }));
    expect(await readLastOrder()).toBeNull();
  });

  it("deletes the cookie when the cart empties", async () => {
    await writeCartLines([{ sku: "A", name: "x", quantity: 1 }]);
    await writeCartLines([]);
    expect((await cookies()).get("hub_cart")).toBeUndefined();
  });

  it("keeps a worst-case order cookie under the 4 KB browser limit", async () => {
    // Every field at the schema's cap, in a 3-byte UTF-8 character: a cookie
    // over the limit is dropped silently, and the confirmation page with it.
    const text = (length: number) => "漢".repeat(length);
    await writeLastOrder({
      id: "0F1E2D3C",
      createdAt: new Date(0).toISOString(),
      email: `${"a".repeat(64)}@${"b".repeat(185)}.test`,
      name: text(100),
      phone: text(32),
      address: `${text(200)}, ${text(20)} ${text(100)}, jud. ${text(60)}, RO`,
      billing: { company: text(100), cui: "RO1234567890", regCom: text(30) },
      confirmationSent: true,
      lines: Array.from({ length: MAX_LINES }, (_, i) => ({
        sku: `${i}`.padEnd(64, "S"),
        name: text(80),
        quantity: 99,
        lineTotal: ron(99_999_999),
      })),
      total: ron(999_999_999),
    });

    const value = (await cookies()).get("hub_order")?.value ?? "";
    expect(value).not.toBe("");
    expect(`hub_order=${value}`.length).toBeLessThan(4096);
  });
});
