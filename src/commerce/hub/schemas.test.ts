import { describe, expect, it } from "vitest";
import {
  hubCategorySchema,
  hubPriceSchema,
  hubProductDetailSchema,
  hubStockSchema,
  toCategory,
  toOffer,
  toProductDetail,
  toStock,
} from "./schemas";

const price = (over: Record<string, unknown> = {}) =>
  hubPriceSchema.parse({
    value: 66,
    special: null,
    currency: "RON",
    tax_included: true,
    show: true,
    ...over,
  });

/**
 * HUB sends money as a major-unit JSON number; this codebase's rule is integer
 * minor units. This boundary is the only place that conversion happens, so it is
 * the only place it can go wrong.
 */
describe("money conversion", () => {
  it("converts whole major units to minor units", () => {
    expect(toOffer(price({ value: 66 })).price).toEqual({
      amountMinor: 6600,
      currency: "RON",
    });
  });

  it("converts a fractional price without float drift", () => {
    // 66.7 * 100 is 6670.000000000001 in binary floating point. Rounding at the
    // boundary is what keeps every later operation in integers. Live data was
    // all-integer when sampled, which is exactly why this must not be assumed.
    expect(toOffer(price({ value: 66.7 })).price?.amountMinor).toBe(6670);
    expect(toOffer(price({ value: 0.1 })).price?.amountMinor).toBe(10);
    expect(toOffer(price({ value: 12.34 })).price?.amountMinor).toBe(1234);
  });

  it("rejects a price with more decimals than the currency has, instead of rounding it", () => {
    // This started as a wrong expectation of mine — I assumed 1.005 would round
    // to 101 minor units. It does not: 1.005 * 100 is 100.49999999999999, so
    // Math.round yields 100. The nearest double to 1.005 is genuinely below it,
    // so the intended value is unrecoverable and rounding would be silently and
    // unpredictably lossy. Rejecting is the only honest answer, and a third
    // decimal in a 2-digit currency is a feed error anyway.
    expect(() => price({ value: 1.005 })).toThrow();
    expect(() => price({ value: 66.789 })).toThrow();
    expect(() => price({ special: 1.005 })).toThrow();
  });

  it("scales by the currency's own exponent, not a hardcoded 100", () => {
    // The first version of this multiplied by 100 unconditionally, which is
    // wrong for a 0-digit currency: ¥66 would have become 6600 minor units.
    // `moneda` is a contract field, so another currency is possible.
    expect(toOffer(price({ value: 66, currency: "JPY" })).price).toEqual({
      amountMinor: 66,
      currency: "JPY",
    });
    expect(toOffer(price({ value: 8.9, currency: "KWD" })).price).toEqual({
      amountMinor: 8900,
      currency: "KWD",
    });
  });

  it("rejects a price in exponential notation rather than rounding it to free", () => {
    // `1e-7` has no readable decimal count; treating it as 0 decimals would
    // round it to zero minor units, i.e. silently free.
    expect(() => price({ value: 1e-7 })).toThrow();
  });

  it("produces an integer for every fractional input", () => {
    for (let cents = 0; cents < 500; cents++) {
      const major = cents / 100;
      const minor = toOffer(price({ value: major })).price!.amountMinor;
      expect(Number.isInteger(minor), `${major} produced ${minor}`).toBe(true);
      expect(minor).toBe(cents);
    }
  });

  it("keeps a null price distinct from a zero price", () => {
    // "no price" and "free" are different things and the UI must not conflate
    // them: one is unpurchasable, the other is a price.
    expect(toOffer(price({ value: null })).price).toBeNull();
    expect(toOffer(price({ value: 0 })).price).toEqual({
      amountMinor: 0,
      currency: "RON",
    });
  });

  it("carries a promo price only when upstream sends a real reduction", () => {
    expect(toOffer(price({ special: null })).promoPrice).toBeNull();
    expect(toOffer(price({ special: 49.5 })).promoPrice).toEqual({
      amountMinor: 4950,
      currency: "RON",
    });
  });

  it("preserves the VAT-inclusive flag rather than silently assuming", () => {
    expect(toOffer(price({ tax_included: true })).vatIncluded).toBe(true);
    expect(toOffer(price({ tax_included: false })).vatIncluded).toBe(false);
  });

  it("preserves a price that exists but must not be displayed", () => {
    const offer = toOffer(price({ show: false }));
    expect(offer.displayable).toBe(false);
    expect(offer.price).not.toBeNull();
  });

  it.each([
    ["a negative price", -1],
    ["infinity", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
    ["an implausibly large price", 2_000_000],
  ])("rejects %s at the boundary", (_label, value) => {
    // A bad number must fail here, where it is an infrastructure fault, rather
    // than reach money arithmetic and land on an invoice.
    expect(() => price({ value })).toThrow();
  });

  it("rejects a price sent as a string", () => {
    expect(() => price({ value: "66" })).toThrow();
  });
});

describe("stock mapping", () => {
  it.each(["stoc", "limitat", "sfurnizor", "furnizor", "nostoc", "soon"])(
    "passes through the known state %s",
    (state) => {
      const stock = toStock(
        hubStockSchema.parse({
          state,
          label: "x",
          orderable: true,
          quantity: 3,
        }),
      );
      expect(stock.state).toBe(state);
    },
  );

  it("degrades an unknown state instead of failing the parse", () => {
    // The contract permits adding values. A new state upstream must not take a
    // product page down.
    const stock = toStock(
      hubStockSchema.parse({
        state: "backorder_2027",
        label: "Later",
        orderable: false,
      }),
    );
    expect(stock.state).toBe("unknown");
    expect(stock.label).toBe("Later");
    expect(stock.quantity).toBeNull();
  });
});

describe("category mapping", () => {
  const raw = (over: Record<string, unknown> = {}) =>
    hubCategorySchema.parse({
      id: 1727,
      parent: 5431,
      name: "Kyocera TK-7300",
      url: "",
      kind: "family",
      title: "kyocera_tk7300",
      image: null,
      meta: { title: "", description: "" },
      ...over,
    });

  it("reports an uncounted category as null, never zero", () => {
    // The contract is explicit: absent is not zero. A client hiding empty
    // categories would otherwise hide the entire tree.
    expect(toCategory(raw()).productCount).toBeNull();
    expect(toCategory(raw({ products: 0 })).productCount).toBe(0);
    expect(toCategory(raw({ products: 326 })).productCount).toBe(326);
  });

  it("degrades an unknown kind rather than failing", () => {
    expect(toCategory(raw({ kind: "something" })).kind).toBe("unknown");
    expect(toCategory(raw({ kind: "brand" })).kind).toBe("brand");
  });

  it("keeps the empty slug the live feed actually sends", () => {
    // Every one of 11,991 live categories had an empty url. Inventing a slug
    // here would be inventing catalogue structure.
    expect(toCategory(raw()).slug).toBe("");
  });
});

describe("product detail mapping", () => {
  const detail = (over: Record<string, unknown> = {}) =>
    hubProductDetailSchema.parse({
      id: 12679,
      sku: "DEV-D3130C",
      url: "dev-d3130c",
      name: "Carrier / Developer",
      brand: "Dell",
      manufacturer: "SCC",
      type: "drefill",
      is_pack: false,
      price: {
        value: 66,
        special: null,
        currency: "RON",
        tax_included: true,
        show: true,
      },
      stock: {
        state: "limitat",
        label: "Stoc limitat",
        orderable: true,
        quantity: 30,
      },
      image: null,
      meta: { title: "t", description: "d" },
      ...over,
    });

  it("keeps repeated specification keys, because a map would lose them", () => {
    // "Compatibil OEM" legitimately appears dozens of times. Keying by name
    // would silently keep only the last value.
    const product = toProductDetail(
      detail({
        features: [
          { name: "Compatibil OEM", value: "CE255A" },
          { name: "Compatibil OEM", value: "CE255X" },
          { name: "Culoare", value: "Negru" },
        ],
      }),
    );

    expect(product.specs).toHaveLength(3);
    expect(
      product.specs.filter((s) => s.name === "Compatibil OEM"),
    ).toHaveLength(2);
  });

  it("carries the description as HTML without rendering it", () => {
    // Kept so the render edge can decide, rather than silently dropped — but it
    // is markup from upstream and must be sanitised before display.
    const product = toProductDetail(
      detail({ description: "<p>Toner <b>original</b></p>" }),
    );
    expect(product.descriptionHtml).toBe("<p>Toner <b>original</b></p>");
  });

  it("distinguishes an absent bundle/variant list from an empty one", () => {
    // Absent means "not requested"; empty means "requested, none exist". The
    // distinction now travels through the second argument rather than the product
    // object, because the API returns `related` and `components` as siblings of
    // `product` rather than fields of it.
    expect(toProductDetail(detail()).bundleContents).toBeNull();
    expect(toProductDetail(detail(), {}).variants).toBeNull();

    expect(
      toProductDetail(detail(), { bundleContents: [] }).bundleContents,
    ).toEqual([]);
    expect(toProductDetail(detail(), { variants: [] }).variants).toEqual([]);
  });

  it("requires a sku, which the contract calls the stable key", () => {
    expect(() => detail({ sku: "" })).toThrow();
  });
});
