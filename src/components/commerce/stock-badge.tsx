import { cn } from "@/lib/utils";

/**
 * Below this many units we say "stoc limitat" rather than a bare "in stoc".
 *
 * A storefront threshold, not a backend one: the API reports the real quantity
 * and this decides how to phrase it. Set at 5 because that is roughly where a
 * business ordering a box of toner would want to be warned rather than
 * surprised at checkout.
 */
export const LOW_STOCK_THRESHOLD = 5;

export type StockState = "in" | "low" | "out";

export function stockState(inStock: boolean, quantity: number): StockState {
  if (!inStock || quantity <= 0) return "out";
  return quantity <= LOW_STOCK_THRESHOLD ? "low" : "in";
}

const LABEL: Record<StockState, string> = {
  in: "In stoc",
  low: "Stoc limitat",
  out: "Stoc epuizat",
};

const DOT: Record<StockState, string> = {
  in: "bg-stock-in",
  low: "bg-stock-low",
  out: "bg-stock-out",
};

const TEXT: Record<StockState, string> = {
  in: "text-stock-in",
  low: "text-stock-low",
  out: "text-stock-out",
};

/**
 * Stock as a coloured dot plus a word.
 *
 * The word is not optional. Colour alone fails WCAG 1.4.1 and is the single
 * most common accessibility defect in commerce listings — and "is this actually
 * available" is the question the badge exists to answer, so getting it wrong
 * for a colour-blind shopper costs an order, not just a point.
 *
 * `showQuantity` is for the PDP, where the exact count is decision-relevant.
 * Listings omit it: a number per card is noise when scanning twenty of them.
 */
export function StockBadge({
  inStock,
  quantity,
  showQuantity = false,
  className,
}: {
  inStock: boolean;
  quantity: number;
  showQuantity?: boolean;
  className?: string;
}) {
  const state = stockState(inStock, quantity);

  return (
    <p className={cn("flex items-center gap-1.5 text-sm", className)}>
      <span
        className={cn("size-2 shrink-0 rounded-full", DOT[state])}
        aria-hidden
      />
      <span className={cn("font-medium", TEXT[state])}>{LABEL[state]}</span>
      {showQuantity && state !== "out" && (
        <span className="text-muted-foreground">
          ({quantity} {quantity === 1 ? "bucata" : "bucati"})
        </span>
      )}
    </p>
  );
}

/** Matches StockBadge's line box so the streamed swap costs no layout shift. */
export function StockBadgeSkeleton({ className }: { className?: string }) {
  return (
    <p className={cn("flex h-5 items-center", className)} aria-hidden>
      <span className="bg-muted h-3.5 w-24 animate-pulse rounded" />
    </p>
  );
}
