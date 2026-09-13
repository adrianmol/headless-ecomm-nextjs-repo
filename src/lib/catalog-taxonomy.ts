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

export const CATEGORIES: readonly Category[] = [
  {
    slug: "tonere",
    abbr: "TO",
    kind: "toner",
    name: "Tonere",
    description:
      "Cartuse de toner compatibile pentru imprimante laser, cu randament verificat.",
  },
  {
    slug: "cartuse-cerneala",
    abbr: "CC",
    kind: "inkjet",
    name: "Cartuse cerneala",
    description:
      "Cartuse cu cerneala compatibile pentru imprimante si multifunctionale inkjet.",
  },
  {
    slug: "unitati-cilindru",
    abbr: "CI",
    kind: "drum",
    name: "Unitati cilindru",
    description:
      "Unitati de cilindru (drum) compatibile, cu randament de zeci de mii de pagini.",
  },
  {
    slug: "unitati-cuptor",
    abbr: "CU",
    kind: "fuser",
    name: "Unitati cuptor",
    description:
      "Unitati de cuptor (fuser) si ansambluri compatibile pentru service si intretinere.",
  },
  {
    slug: "recipiente-toner",
    abbr: "RT",
    kind: "waste",
    name: "Recipiente toner",
    description:
      "Recipiente pentru toner rezidual, consumabile de intretinere periodica.",
  },
  {
    slug: "role",
    abbr: "RO",
    kind: "roller",
    name: "Role",
    description:
      "Role de preluare si separare a hartiei, pentru blocajele repetate de alimentare.",
  },
] as const;

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function categoryByKind(kind: string | undefined): Category | undefined {
  return CATEGORIES.find((category) => category.kind === kind);
}
