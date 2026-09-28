import { describe, expect, it } from "vitest";
import type { HubCategory } from "./schemas";
import { printerName, resolveTaxonomy } from "./taxonomy";

const category = (
  id: number,
  parentId: number,
  name: string,
  kind: HubCategory["kind"],
): HubCategory => ({
  id,
  parentId,
  name,
  kind,
  slug: "",
  title: "",
  imageUrl: null,
  metaTitle: "",
  metaDescription: "",
  productCount: null,
});

const TREE = [
  category(51, 0, "Canon", "brand"),
  category(535, 51, "Canon inkjet", "unknown"),
  category(576, 535, "Canon PGI-29", "family"),
  category(21119, 535, "PIXMA PRO-1", "prn"),
  // Parent 5853 is not in the tree, as for 75% of the live catalogue.
  category(25968, 5853, "CX510de (28E0512)", "prn"),
];

describe("resolveTaxonomy", () => {
  it("splits a product's categories into printers and families", () => {
    // 10 is a main product category, which HUB does not publish.
    const { printers, families } = resolveTaxonomy([10, 576, 21119], TREE);

    expect(printers).toEqual([
      { id: 21119, name: "PIXMA PRO-1", brand: "Canon" },
    ]);
    expect(families.map((f) => f.name)).toEqual(["Canon PGI-29"]);
  });

  it("leaves the brand unknown when the chain to it is broken", () => {
    const { printers } = resolveTaxonomy([25968], TREE);
    expect(printers[0].brand).toBeNull();
  });

  it("does not hang on a cycle in the feed", () => {
    const loop = [category(1, 2, "A", "prn"), category(2, 1, "B", "family")];
    expect(resolveTaxonomy([1], loop).printers[0].brand).toBeNull();
  });
});

describe("printerName", () => {
  it("puts the brand first, once", () => {
    expect(printerName({ id: 1, name: "PIXMA PRO-1", brand: "Canon" })).toBe(
      "Canon PIXMA PRO-1",
    );
    expect(printerName({ id: 1, name: "Canon PIXMA", brand: "Canon" })).toBe(
      "Canon PIXMA",
    );
    expect(printerName({ id: 1, name: "CX510de", brand: null })).toBe(
      "CX510de",
    );
  });
});
