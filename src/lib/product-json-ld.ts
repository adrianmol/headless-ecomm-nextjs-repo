import { minorUnitExponent, type Money } from "./money";
import { LOCALE } from "./locale";

/**
 * `Product` structured data for a HUB product (plan, stage 13).
 *
 * Every figure here must be the one on the page: Merchant Center compares the
 * two and suspends the product when they differ. So the caller passes the same
 * price and stock it renders, and this function decides nothing about either.
 */

export type ProductJsonLdInput = {
  name: string;
  sku: string;
  /** Absolute. Omitted when the storefront's origin is not configured. */
  url?: string;
  imageUrl: string | null;
  description: string;
  /** Equipment brand, e.g. Canon. */
  brand: string;
  /** Commercial mark, e.g. HQ Premium — or `Original` for OEM goods. */
  manufacturer: string;
  ean: string;
  /** HUB's form: `Lexmark:80C2SK0|78C20K0`. */
  oem: string;
  /** What the customer pays, or `null` when no price may be shown. */
  price: Money | null;
  stockState: string;
  /** Names of the printers it fits. */
  printers: readonly string[];
};

/**
 * `sfurnizor` is goods at the supplier, delivered in days: in stock, as far as
 * a buyer is concerned. `furnizor` is ordered in on request, which is what
 * `BackOrder` means. Anything else — `nostoc`, `soon`, a state HUB adds later
 * — is not orderable, and claiming otherwise is the expensive kind of wrong.
 */
const AVAILABILITY: Record<string, string> = {
  stoc: "InStock",
  limitat: "InStock",
  sfurnizor: "InStock",
  furnizor: "BackOrder",
};

/** The first OEM code: `Lexmark:80C2SK0|78C20K0` → `80C2SK0`. */
export function firstOemCode(oem: string): string | null {
  const codes = oem.includes(":") ? oem.slice(oem.indexOf(":") + 1) : oem;
  return codes.split("|")[0]?.trim() || null;
}

/** GTIN-8, -12, -13 or -14. Anything else is not a GTIN and is left out. */
const isGtin = (value: string) => /^(\d{8}|\d{12,14})$/.test(value);

/** `17100` bani → `"171.00"`: a decimal string, as the vocabulary wants. */
function decimalPrice(money: Money): string {
  const exponent = minorUnitExponent(money.currency, LOCALE);
  return (money.amountMinor / 10 ** exponent).toFixed(exponent);
}

export function productJsonLd(
  input: ProductJsonLdInput,
): Record<string, unknown> {
  // An OEM product's brand is the equipment maker; a compatible one's is the
  // mark it is sold under.
  const brand =
    input.manufacturer && input.manufacturer !== "Original"
      ? input.manufacturer
      : input.brand;
  const mpn = firstOemCode(input.oem);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    sku: input.sku,
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(isGtin(input.ean) ? { gtin: input.ean } : {}),
    ...(mpn ? { mpn } : {}),
    ...(input.printers.length > 0
      ? {
          isAccessoryOrSparePartFor: input.printers.map((name) => ({
            "@type": "Product",
            name,
          })),
        }
      : {}),
    // No offer without a price: an `Offer` with none is invalid, and a product
    // whose price may not be shown has nothing to state here.
    ...(input.price
      ? {
          offers: {
            "@type": "Offer",
            price: decimalPrice(input.price),
            priceCurrency: input.price.currency,
            availability: `https://schema.org/${
              AVAILABILITY[input.stockState] ?? "OutOfStock"
            }`,
            itemCondition: "https://schema.org/NewCondition",
            ...(input.url ? { url: input.url } : {}),
          },
        }
      : {}),
  };
}
