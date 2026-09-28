import { LOCALE } from "./locale";
import type { Money } from "./money";

/**
 * Page yield from HUB's `capacity`, or `null` when it is not a page count.
 *
 * The field holds whatever the product is measured in. Sampled live on
 * 2026-09-28: `2500` and `36000` are pages, `36ml` and `70gr` are not,
 * `2.5K/70gr` is a refill kit and `pack` is a bundle. Bare digits are the only
 * form that means pages, so anything else yields no figure rather than a guess.
 */
export function pagesFromCapacity(capacity: string): number | null {
  if (!/^\d{1,7}$/.test(capacity)) return null;
  const pages = Number(capacity);
  return pages > 0 ? pages : null;
}

/**
 * Cost per printed page, e.g. `0,61 bani / pagină`.
 *
 * Display only, like `discountPercent`: it produces a label, never a `Money`,
 * and nothing is charged from it. RON only, because "bani" is the RON minor
 * unit and the figure would be mislabelled in any other currency.
 */
export function formatCostPerPage(price: Money, pages: number): string | null {
  if (price.currency !== "RON" || pages <= 0) return null;

  const bani = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price.amountMinor / pages);

  return `${bani} bani / pagină`;
}
