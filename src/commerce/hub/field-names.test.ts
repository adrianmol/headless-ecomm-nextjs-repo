import { describe, expect, it } from "vitest";
import { normaliseHubKeys } from "./field-names";

describe("normaliseHubKeys", () => {
  it("renames the keys the API actually changed", () => {
    // Every pair here was observed on the wire, not translated. Several are not
    // literal: promo → special, cu_tva → tax_included, caracteristici → features.
    expect(
      normaliseHubKeys({
        pret: {
          valoare: 66,
          promo: 49,
          moneda: "RON",
          cu_tva: true,
          se_arata: true,
        },
        stoc: {
          stare: "stoc",
          eticheta: "In stoc",
          se_comanda: true,
          cantitate: 3,
        },
        caracteristici: [{ nume: "Culoare", valoare: "Negru" }],
      }),
    ).toEqual({
      price: {
        value: 66,
        special: 49,
        currency: "RON",
        tax_included: true,
        show: true,
      },
      stock: { state: "stoc", label: "In stoc", orderable: true, quantity: 3 },
      features: [{ name: "Culoare", value: "Negru" }],
    });
  });

  it("recurses through arrays and nested objects", () => {
    expect(
      normaliseHubKeys({
        categorii: [
          {
            id: 1,
            parinte: 0,
            nume: "Brother",
            meta: { titlu: "t", descriere: "d" },
          },
        ],
      }),
    ).toEqual({
      categories: [
        {
          id: 1,
          parent: 0,
          name: "Brother",
          meta: { title: "t", description: "d" },
        },
      ],
    });
  });

  it("rewrites keys but never values", () => {
    // A specification whose value is the word "tip" is data. Renaming it would
    // corrupt the catalogue rather than normalise it.
    expect(
      normaliseHubKeys({ caracteristici: [{ nume: "tip", valoare: "nume" }] }),
    ).toEqual({ features: [{ name: "tip", value: "nume" }] });
  });

  it("prefers the English key when both spellings are present", () => {
    // Otherwise key order decides, which is nobody's decision.
    expect(normaliseHubKeys({ nume: "ro", name: "en" })).toEqual({
      name: "en",
    });
    expect(normaliseHubKeys({ name: "en", nume: "ro" })).toEqual({
      name: "en",
    });
  });

  it("leaves an already-English payload untouched", () => {
    const english = {
      category: { id: 1, parent: 0, name: "Brother", kind: "brand" },
      pagination: { page: 1, per_page: 24, total: 5, pages: 1 },
    };
    expect(normaliseHubKeys(english)).toEqual(english);
  });

  it("passes through primitives and null without ceremony", () => {
    expect(normaliseHubKeys(null)).toBeNull();
    expect(normaliseHubKeys(42)).toBe(42);
    expect(normaliseHubKeys("nume")).toBe("nume");
    expect(normaliseHubKeys([1, "two", null])).toEqual([1, "two", null]);
  });

  it("does not rebuild class instances", () => {
    // A Date survives JSON only as a string, so this cannot occur in a response —
    // but rebuilding one via Object.entries would silently produce an empty object,
    // and a guard is cheaper than that surprise.
    const date = new Date("2026-09-13T00:00:00Z");
    expect(normaliseHubKeys({ when: date })).toEqual({ when: date });
  });

  it("preserves keys it has no opinion about", () => {
    expect(
      normaliseHubKeys({ id: 1, sku: "X", oem: "CE255A", url: "s" }),
    ).toEqual({
      id: 1,
      sku: "X",
      oem: "CE255A",
      url: "s",
    });
  });
});
