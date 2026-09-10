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
};

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
}: ProductCardProps) {
  return (
    <article className="group border-border bg-card focus-within:ring-ring relative flex h-full flex-col rounded-lg border p-3 transition-colors focus-within:ring-2 hover:border-neutral-400">
      <div className="bg-muted relative aspect-square overflow-hidden rounded">
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
        {kindLabel && (
          <span className="bg-background/90 text-muted-foreground absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium">
            {kindLabel}
          </span>
        )}
        {isOriginal && (
          <span className="bg-promo text-promo-foreground absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold">
            Original
          </span>
        )}
      </div>

      <h3 className="mt-2.5 text-sm leading-snug font-medium">
        {/*
          The whole card is the click target via this stretched link, so there
          is exactly one link per card. Wrapping the card in an <a> instead
          would put the image, codes and price inside the accessible name and
          make the link announce as a paragraph of specifications.
        */}
        <Link
          href={`/produse/${slug}`}
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
            <dd>{formatYield(yieldPages)}</dd>
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
        {stockSlot}
        <div className="mt-1.5">{priceSlot}</div>
      </div>
    </article>
  );
}

/**
 * Mirrors ProductCard's box: same border and padding, same square image, same
 * three metadata lines, same bottom price block. If the two drift apart the
 * Suspense swap shifts the grid and costs CLS against the 0.05 budget.
 */
export function ProductCardSkeleton() {
  return (
    <div
      className="border-border bg-card flex h-full flex-col rounded-lg border p-3"
      aria-hidden
    >
      <div className="bg-muted aspect-square animate-pulse rounded" />
      <div className="bg-muted mt-2.5 h-5 w-5/6 animate-pulse rounded" />
      <div className="mt-1.5 space-y-1">
        <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
        <div className="bg-muted h-3 w-1/4 animate-pulse rounded" />
      </div>
      <div className="mt-auto pt-3">
        <div className="bg-muted h-3.5 w-24 animate-pulse rounded" />
        <div className="mt-1.5">
          <div className="bg-muted h-6 w-28 animate-pulse rounded" />
          <div className="bg-muted mt-1 h-3 w-36 animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}
