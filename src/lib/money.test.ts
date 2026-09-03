import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  addMoney,
  formatMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from "./money";

const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" });

describe("money arithmetic", () => {
  it("stays exact where float arithmetic would not", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. In minor units it is exact.
    expect(addMoney(eur(10), eur(20))).toEqual(eur(30));
    expect(sumMoney([eur(1), eur(2), eur(3)], "EUR")).toEqual(eur(6));
  });

  it("adds and subtracts", () => {
    expect(addMoney(eur(8900), eur(500))).toEqual(eur(9400));
    expect(subtractMoney(eur(8900), eur(900))).toEqual(eur(8000));
  });

  it("refuses to combine different currencies", () => {
    expect(() => addMoney(eur(100), { amountMinor: 100, currency: "USD" })).toThrow(
      CurrencyMismatchError,
    );
  });

  it("multiplies by an integer quantity", () => {
    expect(multiplyMoney(eur(8900), 3)).toEqual(eur(26700));
  });

  it("rejects fractional multipliers, which need a rounding policy", () => {
    expect(() => multiplyMoney(eur(8900), 0.2)).toThrow(TypeError);
  });

  it("sums an empty list to zero", () => {
    expect(sumMoney([], "EUR")).toEqual(zeroMoney("EUR"));
  });
});

describe("formatMoney", () => {
  it("formats two-decimal currencies", () => {
    expect(formatMoney(eur(8900), "en-IE")).toContain("89.00");
  });

  it("respects currencies with no minor unit", () => {
    // JPY has 0 decimal places: 8900 minor units is 8,900 yen, not 89.00.
    const formatted = formatMoney({ amountMinor: 8900, currency: "JPY" }, "en-US");
    expect(formatted).toContain("8,900");
    expect(formatted).not.toContain("89.00");
  });

  it("respects currencies with three minor digits", () => {
    // KWD has 3 decimal places: 8900 minor units is 8.900 dinar.
    expect(formatMoney({ amountMinor: 8900, currency: "KWD" }, "en-US")).toContain(
      "8.900",
    );
  });
});
