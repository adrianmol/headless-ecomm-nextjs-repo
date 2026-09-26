import { formatMoney, type Money } from "@/lib/money";
import { LineThumbnail } from "./line-thumbnail";

export type OrderLineView = {
  sku: string;
  name: string;
  quantity: number;
  /** Server-computed; never summed or multiplied here. */
  lineTotal: Money;
  imageUrl?: string | null;
};

/**
 * Read-only line list for the checkout summary and the order confirmation.
 *
 * The quantity sits on the thumbnail as a badge, which is the convention
 * shoppers recognise from other checkouts, and is repeated as text for screen
 * readers because a badge on an image is not read out in any useful order.
 */
export function OrderLines({ lines }: { lines: readonly OrderLineView[] }) {
  return (
    <ul className="space-y-4">
      {lines.map((line) => (
        <li key={line.sku} className="flex items-center gap-3 text-sm">
          <div className="relative">
            <LineThumbnail imageUrl={line.imageUrl} size="sm" />
            <span
              aria-hidden
              className="bg-foreground text-background absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
            >
              {line.quantity}
            </span>
          </div>
          <p className="min-w-0 flex-1">
            <span className="line-clamp-2">{line.name}</span>
            <span className="sr-only">, cantitate {line.quantity}</span>
          </p>
          <span className="shrink-0 font-medium tabular-nums">
            {formatMoney(line.lineTotal)}
          </span>
        </li>
      ))}
    </ul>
  );
}
