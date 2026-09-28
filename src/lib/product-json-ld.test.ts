import { describe, expect, it } from "vitest";
import {
  firstOemCode,
  productJsonLd,
  type ProductJsonLdInput,
} from "./product-json-ld";

const PRODUCT: ProductJsonLdInput = {
  name: "Toner Premium G&G black Lexmark 80C2SK0 (2.5K)",
  sku: "LCX310K-GG",
  url: "https://shop.test/produse-hub/lcx310k-gg",
  imageUrl: "https://hub.test/img.jpg",
  description: "Toner",
  brand: "Lexmark",
  manufacturer: "G&G",
  ean: "4960999681986",
  oem: "Lexmark:80C2SK0|78C20K0",
  price: { amountMinor: 14200, currency: "RON" },
  stockState: "stoc",
  printers: ["Lexmark CX510de"],
};

describe("productJsonLd", () => {
  it("states the price and stock it was given", () => {
    const ld = productJsonLd(PRODUCT);

    expect(ld.offers).toEqual({
      "@type": "Offer",
      price: "142.00",
      priceCurrency: "RON",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: "https://shop.test/produse-hub/lcx310k-gg",
    });
    expect(ld.gtin).toBe("4960999681986");
    expect(ld.mpn).toBe("80C2SK0");
    expect(ld.brand).toEqual({ "@type": "Brand", name: "G&G" });
    expect(ld.isAccessoryOrSparePartFor).toEqual([
      { "@type": "Product", name: "Lexmark CX510de" },
    ]);
  });

  it("names the equipment maker as the brand of an original", () => {
    const ld = productJsonLd({ ...PRODUCT, manufacturer: "Original" });
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Lexmark" });
  });

  it.each([
    ["furnizor", "BackOrder"],
    ["sfurnizor", "InStock"],
    ["nostoc", "OutOfStock"],
    ["soon", "OutOfStock"],
    // A state HUB adds later must not be advertised as available.
    ["ceva-nou", "OutOfStock"],
  ])("maps stock state %s to %s", (stockState, expected) => {
    const ld = productJsonLd({ ...PRODUCT, stockState });
    expect((ld.offers as { availability: string }).availability).toBe(
      `https://schema.org/${expected}`,
    );
  });

  it("has no offer when no price may be shown", () => {
    expect(productJsonLd({ ...PRODUCT, price: null })).not.toHaveProperty(
      "offers",
    );
  });

  it("leaves out an EAN that is not a GTIN", () => {
    expect(productJsonLd({ ...PRODUCT, ean: "N/A" })).not.toHaveProperty(
      "gtin",
    );
  });
});

describe("firstOemCode", () => {
  it("reads the first code after the brand", () => {
    expect(firstOemCode("Lexmark:80C2SK0|78C20K0")).toBe("80C2SK0");
    expect(firstOemCode("Canon:4873B001")).toBe("4873B001");
    expect(firstOemCode("")).toBeNull();
  });
});
