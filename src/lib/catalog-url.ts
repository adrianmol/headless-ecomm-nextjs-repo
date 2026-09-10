/**
 * Parsing and building of catalog listing URLs.
 *
 * Pure string/URL logic with no data-layer import, so it is unit-testable and
 * shared by every listing route (`/produse`, `/categorii/*`, `/compatibil/*`).
 */

import type { components } from "@/commerce/api";

type ProductKind = components["schemas"]["ProductKind"];
type ProductColor = components["schemas"]["ProductColor"];

/**
 * `kind` and `color` are closed enums in the contract, so a URL carrying
 * anything else is not a filter we can honour and is dropped before it reaches
 * the backend.
 *
 * These arrays list *values*, never display labels — labels still come from the
 * backend facet response, because the set of brands and manufacturers grows
 * with the catalog. A closed enum is different: adding a member is a spec
 * change that regenerates these types, and TypeScript then fails here until the
 * list is updated. That is the point of the `satisfies`.
 */
const KINDS = [
  "toner",
  "inkjet",
  "drum",
  "fuser",
  "waste",
  "roller",
  "other",
] as const satisfies readonly ProductKind[];

const COLORS = [
  "black",
  "cyan",
  "magenta",
  "yellow",
  "tricolor",
  "none",
] as const satisfies readonly ProductColor[];

export type CatalogSort =
  "relevance" | "price_asc" | "price_desc" | "yield_desc";

export const SORTS: readonly { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "Relevanta" },
  { value: "price_asc", label: "Pret crescator" },
  { value: "price_desc", label: "Pret descrescator" },
  { value: "yield_desc", label: "Randament" },
];

export type CatalogQuery = {
  brand?: string;
  model?: string;
  kind?: ProductKind;
  manufacturer?: string;
  color?: ProductColor;
  inStock?: boolean;
  sort?: CatalogSort;
  cursor?: string;
};

/**
 * A cursor is an opaque backend token, so its contents are not ours to
 * constrain — but its *size* is. Without a cap, any visitor can put an
 * arbitrarily long string in `?cursor=` and we forward it upstream on every
 * request. A miss is a live backend round trip, because `use cache` does not
 * cache a rejected call, so this is a cheap amplification vector against the
 * commerce API. 200 bytes is far beyond any real cursor.
 */
const MAX_CURSOR_LENGTH = 200;

/**
 * Facet values are shorter than cursors and are also forwarded upstream. Same
 * reasoning, tighter bound: no real brand slug or manufacturer name is longer.
 */
const MAX_FACET_LENGTH = 64;

/** Control characters cannot appear in a legitimate value and are exactly what
 *  would be used to forge a log line downstream. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function facetValue(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  // Repeated parameters (?brand=a&brand=b) are not supported; taking the first
  // silently would apply a filter the shopper cannot see in the panel.
  if (Array.isArray(raw)) return undefined;
  if (raw === "" || raw.length > MAX_FACET_LENGTH) return undefined;
  if (CONTROL_CHARS.test(raw)) return undefined;
  return raw;
}

function isSort(value: string | undefined): value is CatalogSort {
  return SORTS.some((sort) => sort.value === value);
}

function isKind(value: string | undefined): value is ProductKind {
  return (KINDS as readonly string[]).includes(value ?? "");
}

function isColor(value: string | undefined): value is ProductColor {
  return (COLORS as readonly string[]).includes(value ?? "");
}

export type ParsedCatalogQuery =
  { ok: true; query: CatalogQuery } | { ok: false };

/**
 * Reads a listing URL's search params.
 *
 * A malformed *cursor* fails the whole parse, because it means the visitor
 * followed a broken pagination link and showing page one silently would be a
 * lie about where they are. A malformed *facet* is dropped instead: the listing
 * is still correct, just less filtered, and failing the page over an
 * unrecognised filter would turn a stale bookmark into an error screen.
 */
export function parseCatalogQuery(raw: {
  [key: string]: string | string[] | undefined;
}): ParsedCatalogQuery {
  const query: CatalogQuery = {};

  if (raw.cursor !== undefined) {
    if (Array.isArray(raw.cursor) || raw.cursor === "") return { ok: false };
    if (raw.cursor.length > MAX_CURSOR_LENGTH) return { ok: false };
    if (CONTROL_CHARS.test(raw.cursor)) return { ok: false };
    query.cursor = raw.cursor;
  }

  const brand = facetValue(raw.brand);
  if (brand) query.brand = brand;

  // A model without a brand is meaningless: model designations are not unique
  // across manufacturers, so it is dropped rather than sent upstream alone.
  const model = facetValue(raw.model);
  if (model && brand) query.model = model;

  const kind = facetValue(raw.kind);
  if (isKind(kind)) query.kind = kind;

  const manufacturer = facetValue(raw.manufacturer);
  if (manufacturer) query.manufacturer = manufacturer;

  const color = facetValue(raw.color);
  if (isColor(color)) query.color = color;

  if (raw.inStock === "true") query.inStock = true;

  const sort = facetValue(raw.sort);
  if (isSort(sort)) query.sort = sort;

  return { ok: true, query };
}

/**
 * Builds a listing href with `patch` applied over `query`.
 *
 * **The cursor is always dropped when anything else changes.** A cursor is
 * meaningful only for the filter that produced it; carrying it across a facet
 * change would ask the backend to resume a different result set from a position
 * that no longer exists — a 400 at best, silently wrong products at worst.
 * Pass `cursor` in `patch` to page within a fixed filter.
 */
export function buildCatalogHref(
  basePath: string,
  query: CatalogQuery,
  patch: Partial<CatalogQuery> = {},
): string {
  const next: CatalogQuery = { ...query, ...patch };

  const changesFilter = Object.keys(patch).some((key) => key !== "cursor");
  if (changesFilter && patch.cursor === undefined) delete next.cursor;

  // Clearing a brand must clear its model too, or the next request carries a
  // model filter with no brand and the listing quietly returns nothing.
  if (!next.brand) delete next.model;

  const params = new URLSearchParams();
  // Fixed key order, so the same filter always produces the same URL — which
  // matters for the cache key, for canonical URLs, and for not splitting
  // analytics across three spellings of one page.
  if (next.brand) params.set("brand", next.brand);
  if (next.model) params.set("model", next.model);
  if (next.kind) params.set("kind", next.kind);
  if (next.manufacturer) params.set("manufacturer", next.manufacturer);
  if (next.color) params.set("color", next.color);
  if (next.inStock) params.set("inStock", "true");
  if (next.sort && next.sort !== "relevance") params.set("sort", next.sort);
  if (next.cursor) params.set("cursor", next.cursor);

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Toggles a facet value: selecting the active one clears it. */
export function toggleFacetHref(
  basePath: string,
  query: CatalogQuery,
  key: "brand" | "model" | "kind" | "manufacturer" | "color",
  value: string,
): string {
  const selected = query[key] === value;
  return buildCatalogHref(basePath, query, {
    [key]: selected ? undefined : value,
  });
}
