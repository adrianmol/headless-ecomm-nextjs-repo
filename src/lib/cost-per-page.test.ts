import { describe, expect, it } from "vitest";
import { formatCostPerPage, pagesFromCapacity } from "./cost-per-page";

describe("pagesFromCapacity", () => {
  it("reads bare digits as pages", () => {
    expect(pagesFromCapacity("2500")).toBe(2500);
    expect(pagesFromCapacity("36000")).toBe(36000);
  });

  // Every one of these is a real `capacity` from the live catalogue.
  it.each(["36ml", "70gr", "2.5K/70gr", "pack", "", "0", "2.500"])(
    "refuses %j, which is not a page count",
    (capacity) => {
      expect(pagesFromCapacity(capacity)).toBeNull();
    },
  );
});

describe("formatCostPerPage", () => {
  it("divides the price in bani by the yield", () => {
    // The plan's own example: 171 lei over 28.000 pages.
    expect(
      formatCostPerPage({ amountMinor: 17100, currency: "RON" }, 28000),
    ).toBe("0,61 bani / pagină");
  });

  it("refuses a currency whose minor unit is not bani", () => {
    expect(
      formatCostPerPage({ amountMinor: 17100, currency: "EUR" }, 28000),
    ).toBeNull();
  });
});
