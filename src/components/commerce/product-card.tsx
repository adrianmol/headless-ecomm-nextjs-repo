import Image from "next/image";
import Link from "next/link";
import { formatYield } from "@/lib/locale";

export type ProductCardProps = {
  slug: string;
  title: string;
  image?: { url: string; alt: string; width: number; height: number };
  /** Rated page yield. Omitted for parts that have none (fuser, roller). */
  yieldPages?: number;
  /** OEM codes this item replaces. Rendered verbatim — buyers match on them. */
  oemCodes?: readonly string[];
  /** Who made the consumable (G&G, INTEGRAL…), not the printer brand. */
  manufacturer?: string;
  /** Category label, already localised by the caller. */
  kindLabel?: string;
  /** True for genuine OEM stock. Explicit from the backend, never inferred. */
  isOriginal?: boolean;
  /**
   * Live price and stock. A slot rather than props because these stream in
   * behind <Suspense> after the cached card has already painted — the card
   * itself must never wait on them.
   */
  priceSlot?: React.ReactNode;
  stockSlot?: React.ReactNode;
  /**
   * Set on the cards that are above the fold. The first grid image is usually
   * the LCP element, and leaving it lazy delays the metric the PLP is judged
   * on. Only ever a handful of cards: marking them all `priority` removes the
   * prioritisation entirely and competes for bandwidth.
   */
  priority?: boolean;
  /**
   * The design puts an add-to-cart button on every card. A slot, like the price
   * and stock, so this component stays presentational: adding to the cart needs
   * a variant id and a Server Action, and importing either here would break the
   * `components/` → `commerce/` boundary rule.
   *
   * Optional because a card also appears where adding is meaningless — bundle
   * contents, "other manufacturers" lists — and a disabled button there is
   * noise.
   */
  actionSlot?: React.ReactNode;
  /**
   * The discount pill in the card's top-right corner.
   *
   * A slot rather than a number, because the percentage is derived from
   * compare-at pricing that streams in with the offer — the same data the price
   * block uses. Computing it from a separate source would let a card advertise a
   * discount the price beneath it does not show.
   */
  discountSlot?: React.ReactNode;
  /** Equipment brand — HP, Brother — set above the title as in the design. */
  brand?: string;
  /**
   * Overrides the product link. Defaults to `/produse/{slug}`.
   *
   * Exists because HUB products are not guaranteed a slug: a handful have an empty
   * `url`, and `/produse/` with nothing after it is a link to the listing rather
   * than to the product. The caller knows what identifier is usable.
   */
  href?: string;
};

/**
 * Deliberately no star rating.
 *
 * The design shows five filled stars on every card. No contract available here
 * has a rating or review field, so rendering them would mean printing the same
 * invented five-star score on every product in the shop. That is not the usual
 * "invented copy" problem, it is fabricated social proof — a misleading
 * commercial practice, and the kind of thing a consumer-protection authority
 * fines rather than emails about.
 *
 * When real ratings exist, this is where they go, and the numeric value belongs
 * in the accessible name so the stars are reinforcement rather than the signal.
 */

/**
 * Presentational: plain props, no data-layer import (enforced by the ESLint
 * boundary rule). A Server Component — nothing here is interactive, so shipping
 * it to the browser would be wasted bytes.
 *
 * Information order is deliberate and matches how these are actually bought:
 * what it is, what it replaces, how many pages, is it in stock, what it costs.
 * A shopper comparing twenty cartridges is matching a part code and dividing
 * price by yield, so those two are given the most typographic weight after the
 * title.
 */
export function ProductCard({
  slug,
  title,
  image,
  yieldPages,
  oemCodes,
  manufacturer,
  kindLabel,
  isOriginal,
  priceSlot,
  stockSlot,
  priority,
  actionSlot,
  discountSlot,
  brand,
  href,
}: ProductCardProps) {
  return (
    <article className="group border-border bg-card focus-within:ring-ring relative flex h-full flex-col overflow-hidden rounded-lg border transition-colors focus-within:ring-2 hover:border-neutral-400">
      {/*
        The design runs the badges in a band above the image rather than floating
        them over it. That is also the more robust arrangement: overlaid pills
        sit on whatever colour the product photo happens to have behind them, and
        the contrast is then unknowable.

        The band keeps its height when empty so a card with no badges lines up
        with one that has them, across a ragged grid.
      */}
      <div className="flex min-h-8 items-start justify-between gap-2 px-3 pt-3">
        <div className="min-w-0">{stockSlot}</div>
        {discountSlot && <div className="shrink-0">{discountSlot}</div>}
      </div>

      <div className="bg-muted relative mx-3 aspect-square overflow-hidden rounded">
        {image && (
          <Image
            src={image.url}
            alt={image.alt}
            width={image.width}
            height={image.height}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className="h-full w-full object-contain transition-transform group-hover:scale-105"
          />
        )}
        {isOriginal && (
          <span className="bg-accent text-accent-foreground absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold">
            Original
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        {(brand || kindLabel) && (
          <p className="text-muted-foreground mt-3 text-[11px] font-bold tracking-wide uppercase">
            {brand ?? kindLabel}
          </p>
        )}

        <h3 className="mt-1 text-sm leading-snug font-semibold">
          {/*
            The whole card is the click target via this stretched link, so there
            is exactly one link per card. Wrapping the card in an <a> instead
            would put the image, codes and price inside the accessible name and
            make the link announce as a paragraph of specifications.

            `relative z-10` on the action slot below keeps the button clickable
            in spite of this overlay — without it the stretched link swallows the
            press and every add-to-cart silently navigates instead.
          */}
          <Link
            href={href ?? `/produse/${slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>

        <dl className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
          {oemCodes && oemCodes.length > 0 && (
            <div className="flex gap-1">
              <dt className="sr-only">Coduri echivalente</dt>
              <dd className="truncate font-mono">{oemCodes.join(" · ")}</dd>
            </div>
          )}
          {yieldPages !== undefined && (
            <div>
              <dt className="sr-only">Randament</dt>
              <dd className="font-mono">{formatYield(yieldPages)}</dd>
            </div>
          )}
          {manufacturer && (
            <div>
              <dt className="sr-only">Producator</dt>
              <dd>{manufacturer}</dd>
            </div>
          )}
        </dl>

        {/* Pushed to the bottom so price sits on one line across a ragged grid. */}
        <div className="mt-auto pt-3">
          {priceSlot}
          {actionSlot && <div className="relative z-10 mt-3">{actionSlot}</div>}
        </div>
      </div>
    </article>
  );
}

/**
 * Mirrors ProductCard's box band for band: the badge strip's `min-h-8`, the
 * inset square image, the brand line, title, three metadata lines and the bottom
 * price block. If the two drift apart the Suspense swap shifts the grid and costs
 * CLS against the 0.05 budget — and nothing fails a test when it does, the
 * number just quietly rises.
 *
 * `withAction` must match whether the caller passes an `actionSlot`, for the same
 * reason: a button's worth of height appearing on swap is a visible jump.
 */
export function ProductCardSkeleton({
  withAction = false,
}: {
  withAction?: boolean;
}) {
  return (
    <div
      className="border-border bg-card flex h-full flex-col overflow-hidden rounded-lg border"
      aria-hidden
    >
      <div className="flex min-h-8 items-start px-3 pt-3">
        <div className="bg-muted h-5 w-20 animate-pulse rounded-full" />
      </div>
      <div className="bg-muted mx-3 aspect-square animate-pulse rounded" />
      <div className="flex flex-1 flex-col px-3 pb-3">
        <div className="bg-muted mt-3 h-3 w-16 animate-pulse rounded" />
        <div className="bg-muted mt-1 h-5 w-5/6 animate-pulse rounded" />
        <div className="mt-1.5 space-y-1">
          <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
          <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
          <div className="bg-muted h-3 w-1/4 animate-pulse rounded" />
        </div>
        <div className="mt-auto pt-3">
          <div className="bg-muted h-6 w-28 animate-pulse rounded" />
          <div className="bg-muted mt-1 h-3 w-36 animate-pulse rounded" />
          {/* h-8 rounded-lg: the default Button that AddToCart renders. */}
          {withAction && (
            <div className="bg-muted mt-3 h-8 w-full animate-pulse rounded-lg" />
          )}
        </div>
      </div>
    </div>
  );
}
