import "server-only";
import type { HubCategory } from "./schemas";

/**
 * What a product's category ids say about it.
 *
 * HUB's categories are a compatibility taxonomy — brand → family → printer —
 * and a product lists every node it belongs to. So the printers a consumable
 * fits and the family it belongs to are both read from `categoryIds`, resolved
 * against the tree.
 */

export type HubPrinter = {
  id: number;
  name: string;
  /**
   * `null` when the chain to a brand node is broken, which it is for three
   * printers in four: their parents are unpublished (docs/hub-api-gaps.md
   * §1.3). The product's own `brand` is not a substitute — a consumable fits
   * printers of more than one brand — so an unknown brand stays unknown.
   */
  brand: string | null;
};

/** More than the tree is deep; a cycle in the feed must not hang a render. */
const MAX_DEPTH = 8;

function brandOf(
  category: HubCategory,
  byId: ReadonlyMap<number, HubCategory>,
): string | null {
  let current: HubCategory | undefined = category;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (current.kind === "brand") return current.name;
    current = byId.get(current.parentId);
  }
  return null;
}

export function resolveTaxonomy(
  categoryIds: readonly number[],
  categories: readonly HubCategory[],
): { printers: HubPrinter[]; families: HubCategory[] } {
  const byId = new Map(categories.map((c) => [c.id, c]));
  // Ids that are not in the tree are the main product categories, which HUB
  // does not publish yet. Skipped, not an error.
  const own = categoryIds.flatMap((id) => byId.get(id) ?? []);

  return {
    printers: own
      .filter((c) => c.kind === "prn")
      .map((c) => ({ id: c.id, name: c.name, brand: brandOf(c, byId) })),
    families: own.filter((c) => c.kind === "family"),
  };
}

/** "Konica Minolta bizhub C250i", or just the model when the brand is unknown. */
export function printerName(printer: HubPrinter): string {
  // Some model names already start with the brand; saying it twice reads badly.
  if (!printer.brand || printer.name.startsWith(printer.brand)) {
    return printer.name;
  }
  return `${printer.brand} ${printer.name}`;
}
