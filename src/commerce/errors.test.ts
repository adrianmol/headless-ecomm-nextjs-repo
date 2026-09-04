import { describe, expect, it } from "vitest";
import {
  CommerceErrorException,
  isCommerceErrorException,
  normalizeError,
} from "./errors";

const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" });

describe("normalizeError", () => {
  it("maps out_of_stock with its details", () => {
    expect(
      normalizeError({
        code: "out_of_stock",
        message: "nope",
        details: { variantId: "var_1", available: 2 },
      }),
    ).toEqual({ kind: "OutOfStock", variantId: "var_1", available: 2 });
  });

  it("maps price_changed with both prices", () => {
    expect(
      normalizeError({
        code: "price_changed",
        message: "changed",
        details: { oldPrice: eur(8900), newPrice: eur(9900) },
      }),
    ).toEqual({
      kind: "PriceChanged",
      oldPrice: eur(8900),
      newPrice: eur(9900),
    });
  });

  it("degrades price_changed to Unavailable when the prices are unreadable", () => {
    // We must never guess a price: the customer has to see and accept the new one.
    expect(
      normalizeError({
        code: "price_changed",
        message: "changed",
        details: {},
      }),
    ).toEqual({ kind: "Unavailable", retryable: false });
  });

  it("maps cart_expired and unauthorized", () => {
    expect(normalizeError({ code: "cart_expired", message: "x" })).toEqual({
      kind: "CartExpired",
    });
    expect(normalizeError({ code: "unauthorized", message: "x" })).toEqual({
      kind: "Unauthorized",
    });
  });

  it("exposes validation failures as a machine-readable field, not prose", () => {
    // The backend message is unlocalised and may name internal fields, so it is
    // quarantined as devMessage. The UI keys off `field` and supplies its own copy.
    expect(
      normalizeError({
        code: "validation_failed",
        message: "email invalid",
        details: { field: "email" },
      }),
    ).toEqual({
      kind: "ValidationFailed",
      field: "email",
      devMessage: "email invalid",
    });
  });

  it("still yields a usable error when the backend omits the field", () => {
    expect(
      normalizeError({ code: "validation_failed", message: "bad" }),
    ).toEqual({ kind: "ValidationFailed", field: null, devMessage: "bad" });
  });

  it("treats an unrecognised payload as Unavailable rather than guessing", () => {
    expect(normalizeError({ nonsense: true })).toEqual({
      kind: "Unavailable",
      retryable: false,
    });
    expect(normalizeError(undefined)).toEqual({
      kind: "Unavailable",
      retryable: false,
    });
  });

  it("does not classify by message text", () => {
    // A prose message mentioning stock must not become OutOfStock: messages get
    // reworded and localised, codes do not.
    expect(
      normalizeError({ code: "unavailable", message: "out of stock" }),
    ).toEqual({ kind: "Unavailable", retryable: false });
  });

  it("marks 5xx and 429 retryable", () => {
    expect(normalizeError({ code: "unavailable", message: "x" }, 503)).toEqual({
      kind: "Unavailable",
      retryable: true,
    });
    expect(normalizeError({ code: "unavailable", message: "x" }, 429)).toEqual({
      kind: "Unavailable",
      retryable: true,
    });
    expect(normalizeError({ code: "unavailable", message: "x" }, 400)).toEqual({
      kind: "Unavailable",
      retryable: false,
    });
  });
});

describe("NotFound is distinct from Unavailable", () => {
  it("maps not_found to NotFound", () => {
    expect(
      normalizeError({ code: "not_found", message: "no such product" }),
    ).toEqual({
      kind: "NotFound",
    });
  });

  it("does not collapse a 404 into a server fault", () => {
    // Collapsing them makes every deleted product look like an outage, and
    // buries real outages among deleted products.
    const notFound = normalizeError({ code: "not_found", message: "x" }, 404);
    expect(notFound).not.toMatchObject({ kind: "Unavailable" });
  });
});

describe("isCommerceErrorException", () => {
  it("accepts a genuine NotFound error", () => {
    const error = new CommerceErrorException({ kind: "NotFound" });
    expect(isCommerceErrorException(error)).toBe(true);
    if (isCommerceErrorException(error)) {
      expect(error.error.kind).toBe("NotFound");
    }
  });

  it("accepts every valid CommerceError kind", () => {
    const cases: Array<{ error: ReturnType<typeof normalizeError> }> = [
      { error: { kind: "NotFound" } },
      { error: { kind: "OutOfStock", variantId: null, available: 0 } },
      {
        error: { kind: "PriceChanged", oldPrice: eur(100), newPrice: eur(200) },
      },
      { error: { kind: "CartExpired" } },
      { error: { kind: "Unauthorized" } },
      { error: { kind: "ValidationFailed", field: null, devMessage: "bad" } },
      { error: { kind: "Unavailable", retryable: true } },
    ];

    for (const { error } of cases) {
      expect(isCommerceErrorException(new CommerceErrorException(error))).toBe(
        true,
      );
    }
  });

  it("rejects non-Error values", () => {
    expect(isCommerceErrorException({ name: "CommerceErrorException" })).toBe(
      false,
    );
    expect(isCommerceErrorException(null)).toBe(false);
    expect(isCommerceErrorException(undefined)).toBe(false);
    expect(isCommerceErrorException("CommerceErrorException")).toBe(false);
  });

  it("rejects an unbranded object with an otherwise valid error payload", () => {
    const lookalike = {
      name: "CommerceErrorException",
      message: "NotFound",
      error: { kind: "NotFound" },
    };
    expect(isCommerceErrorException(lookalike)).toBe(false);
  });

  it("rejects an Error with the right name but no validated .error", () => {
    const lookalike = new Error("NotFound");
    lookalike.name = "CommerceErrorException";
    expect(isCommerceErrorException(lookalike)).toBe(false);
  });

  it("rejects an Error whose .error is missing required fields", () => {
    const lookalike = new Error("OutOfStock");
    lookalike.name = "CommerceErrorException";
    (lookalike as { error?: unknown }).error = {
      kind: "OutOfStock",
      variantId: null,
      // missing `available`
    };
    expect(isCommerceErrorException(lookalike)).toBe(false);
  });

  it("rejects an Error whose .error.kind is not in the union", () => {
    const lookalike = new Error("Unknown");
    lookalike.name = "CommerceErrorException";
    (lookalike as { error?: unknown }).error = { kind: "Unknown" };
    expect(isCommerceErrorException(lookalike)).toBe(false);
  });

  it("rejects an object with a mismatched brand symbol", () => {
    const wrongBrand = Symbol.for("headless-ecomm-flow.WrongBrand");
    const lookalike = {
      name: "CommerceErrorException",
      message: "NotFound",
      [wrongBrand]: true,
      error: { kind: "NotFound" },
    };
    expect(isCommerceErrorException(lookalike)).toBe(false);
  });
});
