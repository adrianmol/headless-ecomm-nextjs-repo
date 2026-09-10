/**
 * Single-locale storefront: Romanian, RON.
 *
 * Centralised so the locale is one edit away from being a parameter if the shop
 * ever adds a second market. Scattering `"ro-RO"` through render code is what
 * makes that retrofit expensive (docs/architecture.md §10).
 */
export const LOCALE = "ro-RO";

/**
 * Page yield, e.g. 2000 -> "2.000 pagini". Romanian groups thousands with a
 * dot, which `Intl` gets right and manual formatting does not.
 *
 * Yield is the denominator buyers actually compare on — cost per page — so it
 * appears on every card and must read the same everywhere.
 */
export function formatYield(pages: number): string {
  return `${new Intl.NumberFormat(LOCALE).format(pages)} pagini`;
}

/**
 * VAT rate from basis points, e.g. 2100 -> "21%".
 *
 * Integer division by 100 only when the rate is a whole percent; otherwise one
 * decimal. Romania's standard rate is a whole number, but reduced rates in
 * other EU markets are not, and rendering "9.5%" as "9%" would be wrong on an
 * invoice line.
 */
export function formatVatRate(basisPoints: number): string {
  const percent = basisPoints / 100;
  return `${new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 1,
  }).format(percent)}%`;
}
