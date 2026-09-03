import { formatMoney, type Money } from "@/lib/money";

/**
 * Presentational. Takes plain props and knows nothing about the data layer, so
 * it renders identically from a cached shell or a streamed update.
 */
export function Price({
  price,
  compareAtPrice,
  locale,
}: {
  price: Money;
  compareAtPrice?: Money;
  locale?: string;
}) {
  const onSale =
    compareAtPrice !== undefined &&
    compareAtPrice.currency === price.currency &&
    compareAtPrice.amountMinor > price.amountMinor;

  return (
    <p className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold tabular-nums">
        {formatMoney(price, locale)}
      </span>
      {onSale && (
        <span className="text-muted-foreground text-sm line-through tabular-nums">
          {formatMoney(compareAtPrice, locale)}
        </span>
      )}
    </p>
  );
}

/**
 * Must occupy exactly the height of the loaded <Price>, or the swap when the
 * streamed price arrives costs CLS against the 0.05 budget. `h-8` matches the
 * text-2xl line box; change both together.
 */
export function PriceSkeleton() {
  return (
    <p className="flex h-8 items-center" aria-hidden>
      <span className="bg-muted h-6 w-24 animate-pulse rounded" />
      <span className="sr-only">Loading price</span>
    </p>
  );
}
