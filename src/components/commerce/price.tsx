import { formatMoney, type Money } from "@/lib/money";
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
}: {
  price: Money;
  priceExVat: Money;
  vatRate: number;
  compareAtPrice?: Money;
  size?: "sm" | "lg";
  locale?: string;
}) {
  const onSale =
    compareAtPrice !== undefined &&
    compareAtPrice.currency === price.currency &&
    compareAtPrice.amountMinor > price.amountMinor;

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
