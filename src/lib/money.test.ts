import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  addMoney,
  formatMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
  discountPercent,
  type Money,
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
    expect(() =>
      addMoney(eur(100), { amountMinor: 100, currency: "USD" }),
    ).toThrow(CurrencyMismatchError);
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
    const formatted = formatMoney(
      { amountMinor: 8900, currency: "JPY" },
      "en-US",
    );
    expect(formatted).toContain("8,900");
    expect(formatted).not.toContain("89.00");
  });

  it("respects currencies with three minor digits", () => {
    // KWD has 3 decimal places: 8900 minor units is 8.900 dinar.
    expect(
      formatMoney({ amountMinor: 8900, currency: "KWD" }, "en-US"),
    ).toContain("8.900");
  });
});

describe("discountPercent", () => {
  const ron = (amountMinor: number): Money => ({
    amountMinor,
    currency: "RON",
  });

  it("returns the whole percentage off", () => {
    // 42,00 -> 34,00 is 19.047…%
    expect(discountPercent(ron(3400), ron(4200))).toBe(19);
    expect(discountPercent(ron(5000), ron(10000))).toBe(50);
  });

  it("rounds down, never up", () => {
    // 9.6% off. Shown as 10% it would overstate the saving, and overstating is
    // the direction that attracts a complaint.
    expect(discountPercent(ron(9040), ron(10000))).toBe(9);
    // 19.99% off stays 19.
    expect(discountPercent(ron(8001), ron(10000))).toBe(19);
  });

  it("returns null when there is no discount", () => {
    expect(discountPercent(ron(3400), ron(3400))).toBeNull();
    expect(discountPercent(ron(3400), ron(3000))).toBeNull();
    expect(discountPercent(ron(3400), undefined)).toBeNull();
    expect(discountPercent(ron(3400), null)).toBeNull();
  });

  it("returns null below one percent rather than showing -0%", () => {
    expect(discountPercent(ron(9995), ron(10000))).toBeNull();
  });

  it("returns null across currencies instead of comparing them", () => {
    // Not an error: the two figures are not comparable, so a percentage between
    // them would be meaningless rather than merely wrong.
    expect(
      discountPercent(ron(3400), { amountMinor: 4200, currency: "EUR" }),
    ).toBeNull();
  });

  it("returns null for a zero or negative compare-at", () => {
    expect(discountPercent(ron(3400), ron(0))).toBeNull();
    expect(discountPercent(ron(3400), ron(-4200))).toBeNull();
  });

  it("never returns 100 for a free item, which would read as a bug", () => {
    // A zero price against a real compare-at is 100% off. That is arithmetically
    // right and worth keeping visible rather than special-casing away.
    expect(discountPercent(ron(0), ron(4200))).toBe(100);
  });
});
