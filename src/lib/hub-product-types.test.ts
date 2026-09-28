import { describe, expect, it } from "vitest";
import { groupByType } from "./hub-product-types";

const product = (sku: string, type: string, isBundle = false) => ({
  sku,
  type,
  isBundle,
});

describe("groupByType", () => {
  it("orders groups by configuration, not by arrival or alphabet", () => {
    const groups = groupByType([
      product("chip", "chip"),
      product("drum", "drum"),
      product("toner", "toner"),
    ]);

    expect(groups.map((g) => g.label.type)).toEqual(["toner", "drum", "chip"]);
  });

  it("has no group for a type with no products", () => {
    const groups = groupByType([product("toner", "toner")]);
    expect(groups).toHaveLength(1);
  });

  it("puts bundles last and otherwise keeps the incoming order", () => {
    const [group] = groupByType([
      product("set", "toner", true),
      product("cheap", "toner"),
      product("dear", "toner"),
    ]);

    expect(group.products.map((p) => p.sku)).toEqual(["cheap", "dear", "set"]);
  });

  it("keeps a type HUB added later, at the end", () => {
    const groups = groupByType([
      product("new", "ribbon"),
      product("toner", "toner"),
    ]);

    expect(groups.map((g) => g.label.plural)).toEqual([
      "Cartușe toner",
      "Alte produse",
    ]);
  });
});
