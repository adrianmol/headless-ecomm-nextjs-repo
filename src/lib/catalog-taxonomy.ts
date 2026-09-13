/**
 * Category navigation: which consumable kinds get a route, at what URL, and
 * under what Romanian name.
 *
 * **This is storefront-owned on purpose, and it is the one place that is.**
 * Facet *labels* come from the backend (`Facet.values[].label`) because the set
 * of facet values grows with the catalog and a local map would silently go
 * stale. Category *routes* are different: a URL is a permanent public contract
 * and a navigation decision, so the storefront owns it rather than letting a
 * backend copy edit change a canonical URL under our feet.
 *
 * Kinds absent from this list (`other`) are still listable and still filterable
 * — they just get no top-level nav entry.
 */
import type { components } from "@/commerce/api";

export type ProductKind = components["schemas"]["ProductKind"];

export type Category = {
  /** URL segment under /categorii. */
  slug: string;
  /** The `kind` value sent to the catalog API. */
  kind: ProductKind;
  /** Plural, for nav and page headings. */
  name: string;
  /** One line of intent for the category landing page and its meta description. */
  description: string;
  /**
   * Two letters for the header's circular chip.
   *
   * Stored, not derived. The first version computed initials from the name and
   * produced two identical `UC` chips for "Unitati cilindru" and "Unitati
   * cuptor" — two different categories, indistinguishable in the nav. No
   * derivation rule fixes that in general, because uniqueness is a property of
   * the whole set rather than of any one name, and the design's own choices
   * (`CI` for Cilindri, `RO` for Role) are editorial anyway.
   *
   * A stale abbreviation is visible on every page; a colliding one is not. That
   * trade is why this is a field.
   */
  abbr: string;
};

/**
 * Labels and order follow the owner's design file. Two of the six are broader
 * than the backend kind behind them, and that is a deliberate, recorded
 * compromise rather than an oversight:
 *
 *   "Piese si ansambluri"  →  `fuser`   currently only fuser assemblies
 *   "Accesorii"            →  `waste`   currently only waste-toner containers
 *
 * The alternative for each was worse. `other` exists in the contract as a
 * degradation bucket — "so an unrecognised backend value degrades to a listable
 * product" — so pointing a customer-facing "Accesorii" at it would label whatever
 * the backend failed to classify as an accessory. And inventing `part` and
 * `accessory` kinds would be inventing a backend contract, which this project does
 * not do.
 *
 * So the nav label is the owner's and the description is the truth: each page says
 * exactly what it contains, which is what a shopper actually reads before
 * deciding. The accurate fix is backend kinds for parts and accessories, and it is
 * a backend request rather than a frontend change.
 *
 * `waste` keeping a nav entry under a different label also means no kind lost its
 * navigation in this rename. `other` still has none, as before.
 *
 * Two slugs changed, because the labels changed fundamentally rather than
 * cosmetically: unitati-cuptor → piese-si-ansambluri, recipiente-toner →
 * accesorii. The other four kept theirs even where the label moved — "Toner"
 * still lives at /categorii/tonere — because a URL is a public contract and
 * churning one over a singular/plural difference buys nothing.
 */
export const CATEGORIES: readonly Category[] = [
  {
    slug: "tonere",
    abbr: "TO",
    kind: "toner",
    name: "Toner",
    description:
      "Cartuse de toner compatibile pentru imprimante laser, cu randament verificat.",
  },
  {
    slug: "cartuse-cerneala",
    abbr: "CA",
    kind: "inkjet",
    name: "Cartuse cerneala",
    description:
      "Cartuse cu cerneala compatibile pentru imprimante si multifunctionale inkjet.",
  },
  {
    slug: "piese-si-ansambluri",
    abbr: "PI",
    kind: "fuser",
    name: "Piese si ansambluri",
    // Says what the page holds today, which is narrower than the label above.
    description:
      "Unitati de cuptor (fuser) si ansambluri compatibile pentru service si intretinere.",
  },
  {
    slug: "unitati-cilindru",
    abbr: "CI",
    kind: "drum",
    name: "Cilindri",
    description:
      "Unitati de cilindru (drum) compatibile, cu randament de zeci de mii de pagini.",
  },
  {
    slug: "role",
    abbr: "RO",
    kind: "roller",
    name: "Role si role de transfer",
    description:
      "Role de preluare si separare a hartiei, pentru blocajele repetate de alimentare.",
  },
  {
    slug: "accesorii",
    abbr: "AC",
    kind: "waste",
    name: "Accesorii",
    // Again narrower than the label; the page does not pretend otherwise.
    description:
      "Recipiente pentru toner rezidual, consumabile de intretinere periodica.",
  },
] as const;

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function categoryByKind(kind: string | undefined): Category | undefined {
  return CATEGORIES.find((category) => category.kind === kind);
}
