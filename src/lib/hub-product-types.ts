/**
 * HUB's `type` values, in the order a collection shows them.
 *
 * The plan asks for a fixed order written in configuration, not alphabetical:
 * consumables first, then refill materials. This is that configuration. The
 * values are the ones observed in the live catalogue on 2026-09-28; HUB may add
 * more, and an unlisted one is shown last under {@link OTHER_TYPE} rather than
 * dropped.
 */
export const HUB_PRODUCT_TYPES = [
  { type: "toner", plural: "Cartușe toner", singular: "Toner" },
  { type: "cartus", plural: "Cartușe cerneală", singular: "Cartuș" },
  { type: "drum", plural: "Unități cilindru", singular: "Unitate cilindru" },
  {
    type: "developer",
    plural: "Unități developer",
    singular: "Unitate developer",
  },
  {
    type: "waste",
    plural: "Recipiente toner rezidual",
    singular: "Recipient toner rezidual",
  },
  { type: "fuser", plural: "Unități fuser", singular: "Unitate fuser" },
  {
    type: "kit_refill",
    plural: "Kituri de reîncărcare",
    singular: "Kit de reîncărcare",
  },
  {
    type: "trefill",
    plural: "Toner praf pentru reîncărcare",
    singular: "Toner praf",
  },
  {
    type: "drefill",
    plural: "Developer pentru reîncărcare",
    singular: "Developer",
  },
  { type: "chip", plural: "Chipuri", singular: "Chip" },
  {
    type: "opc",
    plural: "Cilindri fotosensibili (OPC)",
    singular: "Cilindru fotosensibil (OPC)",
  },
] as const;

export const OTHER_TYPE = {
  type: "",
  plural: "Alte produse",
  singular: "Produs",
} as const;

export type HubProductType =
  (typeof HUB_PRODUCT_TYPES)[number] | typeof OTHER_TYPE;

export function hubProductType(type: string): HubProductType {
  return HUB_PRODUCT_TYPES.find((entry) => entry.type === type) ?? OTHER_TYPE;
}

export type ProductGroup<T> = { label: HubProductType; products: T[] };

/**
 * Groups a listing by type, in the configured order.
 *
 * Empty groups do not exist, so there is never a title without content. Inside
 * a group the incoming order is kept — the caller asked HUB for a sort — except
 * that bundles go last, as the plan specifies.
 *
 * Colours are **not** ordered black, cyan, magenta, yellow: the list form of a
 * product carries no colour. See docs/hub-api-gaps.md §1.1.
 */
export function groupByType<T extends { type: string; isBundle: boolean }>(
  products: readonly T[],
): ProductGroup<T>[] {
  const groups = new Map<HubProductType, T[]>();
  for (const product of products) {
    const label = hubProductType(product.type);
    const group = groups.get(label);
    if (group) group.push(product);
    else groups.set(label, [product]);
  }

  return [...HUB_PRODUCT_TYPES, OTHER_TYPE].flatMap((label) => {
    const group = groups.get(label);
    if (!group) return [];
    return [
      {
        label,
        products: [
          ...group.filter((p) => !p.isBundle),
          ...group.filter((p) => p.isBundle),
        ],
      },
    ];
  });
}
