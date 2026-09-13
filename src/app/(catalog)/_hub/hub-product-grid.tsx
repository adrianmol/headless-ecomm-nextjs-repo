import Link from "next/link";
import type { HubProductSummary } from "@/commerce/hub/schemas";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/commerce/product-card";
import { Price } from "@/components/commerce/price";
import { HubStockBadge } from "@/components/commerce/stock-badge";
import { discountPercent } from "@/lib/money";

/**
 * Renders HUB catalogue products with the same card as the rest of the shop.
 *
 * ## Why this is a separate grid from the listing's
 *
 * Not duplication for its own sake — the two data sources differ in ways that
 * change what a card can show:
 *
 *  - **No streamed price.** The provisional API splits static product content from
 *    a live offer, so its cards paint from cache and stream the price in. HUB
 *    returns price and stock inside the product payload, so there is nothing to
 *    stream and no Suspense boundary to put it behind. Pretending otherwise would
 *    mean a skeleton that resolves instantly.
 *  - **No add-to-cart.** HUB has no cart, checkout or order endpoints at all, so
 *    there is no action to wire. A button here would be decoration.
 *  - **No ex-VAT figure.** HUB sends a VAT-inclusive price and no rate, so the
 *    second price line is absent rather than computed. See price.tsx.
 *
 * When HUB becomes the only catalogue, the two grids should converge. Merging them
 * now would mean a component with two mutually exclusive halves.
 */

/** HUB has no cart, so the whole card is a link to the product. */
function hubProductHref(product: HubProductSummary): string {
  // Products *do* have real slugs from upstream, unlike categories. Falling back
  // to the sku keeps the link working for the few that do not.
  return `/produse/${product.slug || encodeURIComponent(product.sku)}`;
}

export function HubProductGrid({
  products,
}: {
  products: readonly HubProductSummary[];
}) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            slug={product.slug || product.sku}
            href={hubProductHref(product)}
            title={product.name}
            brand={product.brand}
            manufacturer={product.manufacturer}
            oemCodes={product.sku ? [product.sku] : undefined}
            image={
              product.imageUrl
                ? {
                    url: product.imageUrl,
                    // Upstream supplies no alt text. The product name is the
                    // honest substitute; an invented description would be worse
                    // for a screen reader than a plain repeat of the title.
                    alt: product.name,
                    width: 400,
                    height: 400,
                  }
                : undefined
            }
            priority={index < 4}
            stockSlot={
              <HubStockBadge
                state={product.stock.state}
                label={product.stock.label}
              />
            }
            priceSlot={
              product.offer.displayable && product.offer.price ? (
                <Price
                  price={product.offer.promoPrice ?? product.offer.price}
                  compareAtPrice={
                    product.offer.promoPrice ? product.offer.price : undefined
                  }
                  size="sm"
                  // Shown in the badge band instead, as the design specifies.
                  showDiscountBadge={false}
                />
              ) : (
                /*
                  `show: false` means the price exists but must not be displayed,
                  which is different from having no price. Both end up here, and
                  both need a reason rather than an empty gap.
                */
                <p className="text-muted-foreground text-sm">Preț la cerere</p>
              )
            }
            discountSlot={<HubDiscountBadge product={product} />}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The percentage pill, from the same helper the rest of the shop uses so the two
 * cannot disagree.
 *
 * HUB models a promotion as `special` alongside the regular `value`, so the
 * *promotional* figure is what a shopper pays and the regular one is struck
 * through — the opposite nesting from the provisional API's `compareAtPrice`.
 */
function HubDiscountBadge({ product }: { product: HubProductSummary }) {
  const { price, promoPrice } = product.offer;
  if (!price || !promoPrice) return null;

  const percent = discountPercent(promoPrice, price);
  if (percent === null) return null;

  return (
    <span className="bg-promo text-promo-foreground rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums">
      −{percent}%
    </span>
  );
}

/** Matches the loaded grid, minus the action row HUB cards do not have. */
export function HubProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <ProductCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

/** Shown when a category resolves but holds nothing. */
export function HubEmptyCategory({ href }: { href: string }) {
  return (
    <p className="text-muted-foreground text-sm">
      Nu am gasit consumabile in aceasta categorie.{" "}
      <Link
        href={href}
        className="text-primary focus-visible:ring-ring rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Vezi tot catalogul
      </Link>
    </p>
  );
}
