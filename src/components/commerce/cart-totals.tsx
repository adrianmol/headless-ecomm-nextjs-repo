import { formatMoney, type Money } from "@/lib/money";
import { LOCALE } from "@/lib/locale";

export type CartTotalsView = {
  subtotal: Money;
  shipping?: Money;
  tax?: Money;
  total: Money;
};

/**
 * Order summary figures.
 *
 * Deliberately *not* the `<Price>` component. `<Price>` renders one offer's
 * VAT-inclusive and VAT-exclusive unit price side by side, which is a product
 * concept; a cart total is a different thing with its own breakdown, and
 * reusing the offer component here would have meant inventing a per-cart
 * ex-VAT figure the backend never sent.
 *
 * Every line rendered here comes from `Cart.totals` exactly as the backend
 * computed it. Nothing is summed, discounted, or VAT-adjusted in the browser:
 * these are the numbers the customer is charged, and the only correct source
 * for them is the response that also created the payment intent.
 *
 * `shipping` and `tax` are optional in the contract and are omitted rather than
 * shown as zero — "Transport: 0,00 lei" asserts free delivery, which is a claim
 * the storefront is not entitled to make on the backend's behalf.
 */
export function CartTotals({
  totals,
  locale = LOCALE,
}: {
  totals: CartTotalsView;
  locale?: string;
}) {
  const rows: { label: string; value: Money; muted?: boolean }[] = [
    { label: "Subtotal", value: totals.subtotal, muted: true },
  ];
  if (totals.shipping) {
    rows.push({ label: "Transport", value: totals.shipping, muted: true });
  }
  if (totals.tax) {
    rows.push({ label: "TVA", value: totals.tax, muted: true });
  }

  return (
    <dl className="space-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="tabular-nums">{formatMoney(row.value, locale)}</dd>
        </div>
      ))}
      <div className="border-border flex items-baseline justify-between border-t pt-2">
        <dt className="font-medium">Total</dt>
        <dd className="text-xl font-semibold tabular-nums">
          {formatMoney(totals.total, locale)}
        </dd>
      </div>
    </dl>
  );
}
