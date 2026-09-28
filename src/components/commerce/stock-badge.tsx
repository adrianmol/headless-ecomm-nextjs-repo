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

/**
 * Filled pills, as in the design, and each foreground is paired with the ground
 * it sits on rather than reused from a white background. That pairing is the
 * whole point of the token split: the design's amber measured 2.69:1 on its own
 * amber pill while looking fine on white.
 */
const PILL: Record<StockState, string> = {
  in: "bg-stock-in-surface text-stock-in",
  low: "bg-stock-low-surface text-stock-low",
  out: "bg-stock-out-surface text-stock-out",
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
    <p className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase",
          PILL[state],
        )}
      >
        {LABEL[state]}
      </span>
      {showQuantity && state !== "out" && (
        <span className="text-muted-foreground text-sm">
          ({quantity} {quantity === 1 ? "bucata" : "bucati"})
        </span>
      )}
    </p>
  );
}

/** Matches StockBadge's pill box so the streamed swap costs no layout shift. */
export function StockBadgeSkeleton({ className }: { className?: string }) {
  return (
    <p className={cn("flex h-5 items-center", className)} aria-hidden>
      <span className="bg-muted h-5 w-20 animate-pulse rounded-full" />
    </p>
  );
}

/**
 * Stock as the HUB catalogue describes it.
 *
 * Separate from {@link StockBadge} because the inputs are different in kind, not
 * just in shape. That component derives a state from a boolean and a quantity;
 * HUB sends the state *and* the text to show for it — the contract calls
 * `eticheta`/`label` "text de afisat". Re-deriving a label from the state would
 * mean overriding the backend's own wording, and HUB draws distinctions this
 * storefront does not: `furnizor` ("La comanda") is orderable with zero on hand,
 * which is neither "in stock" nor "out of stock".
 *
 * So the label is upstream's and only the colour is ours.
 */
const HUB_PILL: Record<string, string> = {
  stoc: "bg-stock-in-surface text-stock-in",
  limitat: "bg-stock-low-surface text-stock-low",
  // Orderable but not held: amber rather than green, because promising immediate
  // availability for a supplier-backed item is the expensive kind of wrong.
  furnizor: "bg-stock-low-surface text-stock-low",
  sfurnizor: "bg-stock-low-surface text-stock-low",
  soon: "bg-stock-low-surface text-stock-low",
  nostoc: "bg-stock-out-surface text-stock-out",
};

export function HubStockBadge({
  state,
  label,
  className,
}: {
  state: string;
  label: string;
  className?: string;
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase",
          // An unrecognised state is still labelled, just neutrally: the contract
          // permits adding values and a new one must not blank the badge.
          HUB_PILL[state] ?? "bg-stock-out-surface text-stock-out",
        )}
      >
        {label}
      </span>
    </p>
  );
}
