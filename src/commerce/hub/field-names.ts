import "server-only";

/**
 * Normalises HUB response keys to one canonical spelling before validation.
 *
 * ## Why this exists
 *
 * The HUB API renamed every field mid-session on 2026-09-13. Measured, not
 * inferred: the same request returned `categorii`, `parinte`, `nume`, `produs`,
 * `pret`, `stoc`, `lipsa` in the morning and `categories`, `parent`, `name`,
 * `product`, `price`, `stock`, `missing` hours later, with no version marker and
 * no change to the path.
 *
 * The contract's own opening paragraph forbids exactly this:
 *
 *   "Numele campurilor sunt contract: se pot adauga, nu se redenumesc si nu se
 *    scot — o vitrina deja scrisa nu trebuie sa se strice fiindca a fost curatat
 *    un nume."
 *
 * So one of the two spellings is a mistake, and there is no way to tell which
 * from here. Picking one and waiting to be wrong would mean the storefront breaks
 * the next time somebody tidies a name — which is the failure the contract
 * promised would not happen and then did.
 *
 * ## Why here rather than in each schema
 *
 * One pass over the payload at the transport boundary keeps every schema below it
 * written against a single spelling. The alternative — every field declared twice
 * and resolved in the mappers — would double the schema surface and weaken it,
 * because a field that may arrive under either of two names cannot be `required`
 * in either.
 *
 * The cost is one walk per response. For the 11,991-category tree that is roughly
 * twelve thousand objects, which is microseconds against a network call, and the
 * result is cached anyway.
 *
 * ## Direction
 *
 * English is canonical because it is what the API serves today and what the
 * storefront's own model already uses. A Romanian response still validates.
 */

/**
 * Romanian field name to its English equivalent, taken from live responses rather
 * than translated: several are not literal, and guessing would have been wrong.
 *
 *   promo   → special        not "promo"
 *   cu_tva  → tax_included   not "with_vat"
 *   se_arata → show          not "displayed"
 *   caracteristici → features  not "specs"
 *   culoare → color          US spelling
 */
const ROMANIAN_TO_ENGLISH: Readonly<Record<string, string>> = {
  // Envelope and collections
  categorii: "categories",
  categorie: "category",
  copii: "children",
  produse: "products",
  produs: "product",
  paginare: "pagination",
  lipsa: "missing",

  // Category
  parinte: "parent",
  nume: "name",
  fel: "kind",
  imagine: "image",
  titlu: "title",
  descriere: "description",

  // Pagination
  pagina: "page",
  pe_pagina: "per_page",
  pagini: "pages",

  // Product
  producator: "manufacturer",
  tip: "type",
  pachet: "is_pack",
  pret: "price",
  stoc: "stock",
  cod_oferta: "offer_code",
  familie: "family",
  capacitate: "capacity",
  culoare: "color",
  sumar: "summary",
  caracteristici: "features",

  // Price
  valoare: "value",
  promo: "special",
  moneda: "currency",
  cu_tva: "tax_included",
  se_arata: "show",

  // Stock
  stare: "state",
  eticheta: "label",
  se_comanda: "orderable",
  cantitate: "quantity",

  /*
   * Unverified, and marked so deliberately. No product encountered so far is a
   * bundle or has offer-code siblings, so the English spelling of these two has
   * never been observed — these are the plausible guesses. If a bundle ever fails
   * to parse, this pair is the first place to look.
   */
  componente: "components",
  variante: "variants",
};

/**
 * Recursively rewrites Romanian keys to their English equivalents.
 *
 * Only keys are touched; values are returned as they arrived. A spec whose *value*
 * is the word "tip" is data, not a field name, and must not change.
 */
export function normaliseHubKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normaliseHubKeys);

  // `typeof null === "object"`, and Date/RegExp would be mangled by the rebuild
  // below — none appear in JSON, but the guard costs nothing.
  if (value === null || typeof value !== "object") return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const canonical = ROMANIAN_TO_ENGLISH[key] ?? key;
    /*
     * A response carrying both spellings of one field would otherwise have the
     * Romanian one silently overwrite the English one depending on key order.
     * The English key is already canonical, so it wins.
     */
    if (canonical !== key && canonical in value) continue;
    out[canonical] = normaliseHubKeys(nested);
  }
  return out;
}

/** Exported for the test that asserts the map stays in step with the schemas. */
export const HUB_FIELD_ALIASES = ROMANIAN_TO_ENGLISH;
