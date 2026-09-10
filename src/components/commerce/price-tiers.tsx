import { formatMoney, type Money } from "@/lib/money";
import { LOCALE } from "@/lib/locale";

export type PriceTier = {
  minQuantity: number;
  unitPrice: Money;
  unitPriceExVat?: Money;
};

/**
 * Quantity breaks for business buyers.
 *
 * **Display only.** These are the same class of value as an optimistic cart
 * total (docs/architecture.md §4): what a customer is actually charged comes
 * back from the cart, computed by the backend against the quantity they really
 * ordered. Nothing here is re-applied client-side, and no total on this page is
 * derived from a tier — otherwise a stale tier would quote a price the checkout
 * then refuses to honour.
 *
 * Rendered as a real <table>: it is tabular data, and a grid of divs would give
 * screen reader users a list of numbers with no relationship between them.
 */
export function PriceTiers({
  tiers,
  locale = LOCALE,
}: {
  tiers: readonly PriceTier[];
  locale?: string;
}) {
  if (tiers.length === 0) return null;

  return (
    <div className="border-border mt-4 rounded-lg border">
      <table className="w-full text-sm">
        <caption className="text-muted-foreground px-3 pt-2.5 pb-1 text-left text-xs">
          Pret redus la cantitate
        </caption>
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th scope="col" className="px-3 py-1.5 text-left font-medium">
              Cantitate
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Pret / bucata
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <tr key={tier.minQuantity} className="border-border border-t">
              <td className="px-3 py-2">{tier.minQuantity}+ buc.</td>
              <td className="px-3 py-2 text-right">
                <span className="font-medium tabular-nums">
                  {formatMoney(tier.unitPrice, locale)}
                </span>
                {tier.unitPriceExVat && (
                  <span className="text-muted-foreground block text-xs tabular-nums">
                    {formatMoney(tier.unitPriceExVat, locale)} fara TVA
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
