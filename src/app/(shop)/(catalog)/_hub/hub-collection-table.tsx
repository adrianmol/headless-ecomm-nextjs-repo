import Link from "next/link";
import type { HubProductSummary } from "@/commerce/hub/schemas";
import { addHubToCartAction } from "@/commerce/session-cart/actions";
import { AddToCart } from "@/components/commerce/add-to-cart";
import { HubStockBadge } from "@/components/commerce/stock-badge";
import { formatMoney } from "@/lib/money";
import type { ProductGroup } from "@/lib/hub-product-types";

/**
 * A collection as the plan draws it (stage 3.2): a table per product type, in a
 * fixed order, rather than a grid of cards. Someone replacing a toner compares
 * rows, and twenty cards do not line up.
 *
 * ## The columns that are missing
 *
 * The plan's table has colour, yield and cost per page, a quality selector, and
 * folds the other manufacturers under "alte 3 ▾". The list form of a product
 * carries none of the fields those need — they exist only on the product page
 * (docs/hub-api-gaps.md §1.1). Fetching each row's product to get them is 131
 * requests for the best-covered printer. So the table shows what a listing
 * does hold, and gains columns when HUB sends them.
 *
 * ## Collapsing
 *
 * Native `<details>`: the first group open, the rest closed with their count in
 * the title, as the plan specifies for phones. Closed groups are still in the
 * delivered HTML, so nothing is hidden from a search engine.
 *
 * ponytail: collapsed on every screen, not phones only — `<details>` cannot be
 * opened by a media query without script. Open them all from `sm` up with
 * `::details-content` once Firefox ships it.
 */

const productHref = (product: HubProductSummary) =>
  `/produse-hub/${encodeURIComponent(product.slug || product.sku)}`;

/**
 * Figures from the cached listing. They decide what the row shows; the action
 * re-prices and re-checks stock live before anything lands in the cart.
 */
function Row({ product }: { product: HubProductSummary }) {
  const { offer, stock } = product;
  const price = offer.displayable ? (offer.promoPrice ?? offer.price) : null;

  return (
    <tr className="border-border border-t align-top">
      <th scope="row" className="py-3 pr-3 text-left font-normal">
        <Link
          href={productHref(product)}
          className="focus-visible:ring-ring rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {product.name}
        </Link>
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {product.manufacturer && <>{product.manufacturer} · </>}
          <span className="font-mono">{product.sku}</span>
        </span>
        {/* On a phone the stock column is gone, so it sits under the name. */}
        <HubStockBadge
          className="mt-1.5 sm:hidden"
          state={stock.state}
          label={stock.label}
        />
      </th>
      <td className="py-3 pr-3 text-right whitespace-nowrap tabular-nums">
        {price ? (
          <>
            <span className="font-semibold">{formatMoney(price)}</span>
            {offer.promoPrice && offer.price && (
              <span className="text-muted-foreground block text-xs line-through">
                {formatMoney(offer.price)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-xs">Preț la cerere</span>
        )}
      </td>
      <td className="hidden py-3 pr-3 sm:table-cell">
        <HubStockBadge state={stock.state} label={stock.label} />
      </td>
      <td className="w-28 py-3">
        {/* None for "Preț la cerere": what may not be shown cannot be charged. */}
        {price && (
          <AddToCart
            variantId={product.sku}
            inStock={stock.orderable}
            action={addHubToCartAction}
            wrapperClassName=""
            label="Adaugă"
            productName={product.name}
            imageUrl={product.imageUrl}
          />
        )}
      </td>
    </tr>
  );
}

export function HubCollectionTable({
  groups,
  collection,
}: {
  groups: readonly ProductGroup<HubProductSummary>[];
  /** The printer or family, for the group titles. */
  collection: string;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group, index) => (
        <details
          key={group.label.plural}
          open={index === 0}
          className="border-border bg-card group rounded-lg border"
        >
          <summary className="focus-visible:ring-ring flex cursor-pointer items-center justify-between gap-4 rounded-lg px-4 py-3 focus-visible:ring-2 focus-visible:outline-none">
            <h2 className="font-bold">
              {group.label.plural} {collection}{" "}
              <span className="text-muted-foreground font-normal">
                ({group.products.length})
              </span>
            </h2>
            <span
              aria-hidden
              className="text-muted-foreground transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>

          <div className="px-4 pb-2">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th scope="col" className="pb-2 text-left font-medium">
                    Produs
                  </th>
                  <th scope="col" className="pr-3 pb-2 text-right font-medium">
                    Preț
                  </th>
                  <th
                    scope="col"
                    className="hidden pb-2 text-left font-medium sm:table-cell"
                  >
                    Stoc
                  </th>
                  <th scope="col" className="pb-2">
                    <span className="sr-only">Adaugă în coș</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.products.map((product) => (
                  <Row key={product.id} product={product} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

/** One open group's worth: a title bar and a few rows. */
export function HubCollectionTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="border-border rounded-lg border" aria-hidden>
      <div className="px-4 py-3">
        <div className="bg-muted h-6 w-72 max-w-full animate-pulse rounded" />
      </div>
      <div className="px-4 pb-2">
        <div className="bg-muted mb-2 h-4 w-full animate-pulse rounded" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="border-border border-t py-3">
            <div className="bg-muted h-10.5 w-full animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
