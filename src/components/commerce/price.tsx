import { discountPercent, formatMoney, type Money } from "@/lib/money";
import { LOCALE, formatVatRate } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * Presentational. Takes plain props and knows nothing about the data layer, so
 * it renders identically from a cached shell or a streamed update.
 *
 * **`priceExVat` is a required prop, and is never computed here.** It arrives
 * from the backend alongside `price`. Deriving it would mean multiplying money
 * by a fraction, which needs a rounding policy — `src/lib/money.ts` refuses
 * fractional multipliers precisely so that policy cannot be invented at the
 * render edge. In Romania the ex-VAT figure is what business buyers compare and
 * what lands on the invoice, so a rounding error here is a billing discrepancy.
 * See ADR-0004.
 */
export function Price({
  price,
  priceExVat,
  vatRate,
  compareAtPrice,
  size = "lg",
  locale = LOCALE,
  /**
   * Whether to show the "−19%" pill beside the struck price.
   *
   * Off for listing cards, which show the same figure in the card's top-right
   * corner as the design specifies. Without this the badge rendered twice on
   * every discounted card — once in the corner, once here — which is what
   * happens when a shared component grows a feature one of its callers already
   * provides.
   */
  showDiscountBadge = true,
}: {
  price: Money;
  priceExVat: Money;
  vatRate: number;
  compareAtPrice?: Money;
  size?: "sm" | "lg";
  locale?: string;
  showDiscountBadge?: boolean;
}) {
  const onSale =
    compareAtPrice !== undefined &&
    compareAtPrice.currency === price.currency &&
    compareAtPrice.amountMinor > price.amountMinor;
  const percentOff = showDiscountBadge
    ? discountPercent(price, compareAtPrice)
    : null;

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={cn(
            "font-semibold tabular-nums",
            size === "lg" ? "text-2xl" : "text-lg",
          )}
        >
          {formatMoney(price, locale)}
        </span>
        {onSale && (
          <span className="text-muted-foreground text-sm line-through tabular-nums">
            {formatMoney(compareAtPrice, locale)}
          </span>
        )}
        {/*
          The same figure the listing card shows in its corner pill, from the same
          helper, so the two cannot disagree. A shopper who sees −19% on the grid
          and −20% here has no way to tell which is the lie.
        */}
        {percentOff !== null && (
          <span className="bg-promo text-promo-foreground rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums">
            −{percentOff}%
          </span>
        )}
      </p>
      {/*
        The ex-VAT line is secondary but always present. B2B buyers price
        against it, and a shop that shows it only sometimes forces them to do
        the arithmetic themselves on the pages that omit it.
      */}
      <p className="text-muted-foreground text-xs tabular-nums">
        {formatMoney(priceExVat, locale)} fara TVA ({formatVatRate(vatRate)})
      </p>
    </div>
  );
}

/**
 * Must occupy exactly the height of the loaded <Price>, or the swap when the
 * streamed price arrives costs CLS against the 0.05 budget.
 *
 * Two lines now, not one: `h-8` for the headline plus `h-4` for the ex-VAT
 * line. Change these together with <Price>'s type sizes or the budget breaks
 * silently — nothing fails a test, the number just drifts.
 */
export function PriceSkeleton({ size = "lg" }: { size?: "sm" | "lg" }) {
  return (
    <div aria-hidden>
      <p className={cn("flex items-center", size === "lg" ? "h-8" : "h-7")}>
        <span className="bg-muted h-6 w-28 animate-pulse rounded" />
      </p>
      <p className="flex h-4 items-center">
        <span className="bg-muted h-3 w-36 animate-pulse rounded" />
      </p>
      <span className="sr-only">Se incarca pretul</span>
    </div>
  );
}
