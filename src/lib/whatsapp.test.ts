import { describe, expect, it } from "vitest";
import { cartQuestion, productQuestion, whatsappHref } from "./whatsapp";

describe("whatsappHref", () => {
  it("encodes the message, so a product name cannot add parameters", () => {
    const href = whatsappHref(
      "40762095550",
      productQuestion("CN-PGI29C", "Cartuș Canon & Co?text=x"),
    );

    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://wa.me/40762095550");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(
      "Bună! Am o întrebare despre CN-PGI29C — Cartuș Canon & Co?text=x",
    );
  });

  it("lists the cart's contents", () => {
    expect(
      cartQuestion([
        { sku: "A-1", quantity: 2 },
        { sku: "B-2", quantity: 1 },
      ]),
    ).toBe("Bună! Am o întrebare despre coșul meu: A-1 × 2, B-2 × 1");
  });
});
