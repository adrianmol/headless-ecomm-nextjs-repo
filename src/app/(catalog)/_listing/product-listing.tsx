import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import {
  listOffers,
  listProducts,
  type Offer,
  type Product,
} from "@/commerce/catalog/queries";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/commerce/product-card";
import { Price, PriceSkeleton } from "@/components/commerce/price";
import {
  StockBadge,
  StockBadgeSkeleton,
} from "@/components/commerce/stock-badge";
import { FacetPanel, type FacetView } from "@/components/commerce/facet-panel";
import { categoryByKind } from "@/lib/catalog-taxonomy";
import {
  SORTS,
  buildCatalogHref,
  toggleFacetHref,
  type CatalogQuery,
} from "@/lib/catalog-url";

/**
 * Products per page.
 *
 * 12, not the 2 the previous implementation shipped. That value was chosen to
 * make a terminal-page test reachable with four fixtures and was flagged in
 * docs/next-steps.md §6 as a test artefact rather than a product decision. 12
 * fills three or four grid rows on a desktop listing, and with the current
 * fixture catalog it still produces a second page, so pagination stays
 * exercised end to end.
 */
export const PAGE_SIZE = 12;

/** Facet keys the panel can toggle. Mirrors the backend's `Facet.key` enum. */
const TOGGLEABLE = ["brand", "model", "kind", "manufacturer", "color"] as const;
type ToggleableKey = (typeof TOGGLEABLE)[number];

function isToggleable(key: string): key is ToggleableKey {
  return (TOGGLEABLE as readonly string[]).includes(key);
}

/**
 * Live price for one card, read from the page's single batched offers request.
 *
 * Every card awaits the *same* promise, so this is one network call for the
 * whole grid rather than one per product — while still letting each price
 * stream in behind its own boundary under a grid that has already painted.
 */
async function CardPrice({
  slug,
  offers,
}: {
  slug: string;
  offers: Promise<Map<string, Offer>>;
}) {
  const offer = (await offers).get(slug);
  // No offer means the product vanished between the cached listing and the
  // live price call. The card stays, without a price — better than blanking
  // the grid or inventing a figure.
  if (!offer) return null;

  return (
    <Price
      price={offer.price}
      priceExVat={offer.priceExVat}
      vatRate={offer.vatRate}
      compareAtPrice={offer.compareAtPrice}
      size="sm"
    />
  );
}

async function CardStock({
  slug,
  offers,
}: {
  slug: string;
  offers: Promise<Map<string, Offer>>;
}) {
  const offer = (await offers).get(slug);
  if (!offer) return null;

  return (
    <StockBadge
      inStock={offer.availability.inStock}
      quantity={offer.availability.quantity}
    />
  );
}

function ProductGrid({
  items,
  offers,
}: {
  items: readonly Product[];
  offers: Promise<Map<string, Offer>>;
}) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            slug={product.slug}
            title={product.title}
            image={product.images[0]}
            yieldPages={product.attributes?.yieldPages}
            oemCodes={product.attributes?.oemCodes}
            manufacturer={product.attributes?.manufacturer}
            kindLabel={categoryByKind(product.kind)?.name}
            isOriginal={product.attributes?.isOriginal}
            // The first row is the LCP candidate on a listing page.
            priority={index < 4}
            stockSlot={
              <Suspense fallback={<StockBadgeSkeleton />}>
                <CardStock slug={product.slug} offers={offers} />
              </Suspense>
            }
            priceSlot={
              <Suspense fallback={<PriceSkeleton size="sm" />}>
                <CardPrice slug={product.slug} offers={offers} />
              </Suspense>
            }
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * A short grid of products for the homepage bands.
 *
 * Exported from here rather than written on the homepage so the cards, the
 * batched-offers pattern and the per-card Suspense boundaries cannot drift from
 * the listing's. A homepage that renders its own slightly different card is how
 * two implementations of a price end up disagreeing.
 *
 * **Its heading is the caller's problem, deliberately.** The design has three
 * bands — "Produse HOT", "Promotii", "Cele mai cumparate produse" — and none of
 * them can be sourced: the contract has no promotion, popularity or featured
 * concept, confirmed by grep. Selecting products for a band called "HOT" would
 * mean inventing merchandising, which is the specific thing that got earlier
 * homepage copy rejected twice. So this returns the first page of the catalogue
 * and lets the caller name it honestly.
 */
export async function ProductStrip({ count = 4 }: { count?: number }) {
  /*
    `await connection()` is required, not decorative. The homepage has no
    searchParams and is otherwise fully prerenderable, so without this the build
    fails outright: `listOffers` is an uncached, request-time read and
    prerendering one would bake a price into static HTML.

    It marks only this subtree as request-time. The band's heading and the card
    skeletons still come from the prerendered shell, and the prices stream in
    behind Suspense — the same arrangement as the PDP, and the reason a stale
    price here is structurally impossible rather than a matter of tuning a TTL.

    Consequence worth stating: it moves `/` from `○` static to `◐` partial
    prerender. That is the correct trade for showing live prices on the homepage,
    and it is a deliberate one rather than the silent reclassification pagination
    caused on `/produse`.
  */
  await connection();

  const { items } = await listProducts({ limit: count });
  if (items.length === 0) return null;

  const offers = listOffers(items.map((item) => item.slug));

  return <ProductGrid items={items} offers={offers} />;
}

export function ProductGridSkeleton({ count = PAGE_SIZE }: { count?: number }) {
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

function SortLinks({
  basePath,
  query,
}: {
  basePath: string;
  query: CatalogQuery;
}) {
  const active = query.sort ?? "relevance";

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="text-muted-foreground mr-1">Sorteaza:</span>
      {SORTS.map((sort) => (
        <Link
          key={sort.value}
          href={buildCatalogHref(basePath, query, { sort: sort.value })}
          scroll={false}
          aria-current={sort.value === active ? "true" : undefined}
          className={
            sort.value === active
              ? "bg-accent text-accent-foreground focus-visible:ring-ring rounded px-2 py-1 font-medium focus-visible:ring-2 focus-visible:outline-none"
              : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded px-2 py-1 focus-visible:ring-2 focus-visible:outline-none"
          }
        >
          {sort.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Shown when the listing query fails outright. Deliberately the same shape as
 * the empty state, so a failure does not look like a different kind of page.
 */
function ListingMessage({ basePath }: { basePath: string }) {
  return (
    <div className="border-border rounded-lg border border-dashed p-10 text-center">
      <p className="font-medium">Nu am putut incarca lista de produse.</p>
      <p className="text-muted-foreground mt-2 text-sm">
        Linkul poate fi vechi. Incearca din nou de la inceputul listei.
      </p>
      <Link
        href={basePath}
        className="text-primary focus-visible:ring-ring mt-4 inline-block rounded text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Inapoi la prima pagina
      </Link>
    </div>
  );
}

/**
 * The catalog listing, shared by `/produse`, `/categorii/*` and `/compatibil/*`.
 *
 * `lockedKeys` are filters the *route* already expresses — the kind on a
 * category page, the brand on a compatibility page. They are applied to the
 * query but hidden from the facet panel, because offering to "remove" a filter
 * that is baked into the URL would produce a link to a page that contradicts
 * its own heading.
 */
export async function ProductListing({
  basePath,
  query,
  lockedKeys = [],
  emptyMessage = "Nu am gasit produse pentru aceste filtre.",
}: {
  basePath: string;
  query: CatalogQuery;
  lockedKeys?: readonly ToggleableKey[];
  emptyMessage?: string;
}) {
  let page;
  try {
    page = await listProducts({ ...query, limit: PAGE_SIZE });
  } catch {
    // A designed message, not the route error boundary. The most common cause
    // is a stale or hand-edited `?cursor=`, which the backend rejects — that is
    // a bad link, not an outage, and blowing up the whole route for it loses
    // the header, the facets and any way back. Backend prose and error codes
    // are never surfaced; the customer gets a way out instead.
    return <ListingMessage basePath={basePath} />;
  }

  const items = page.items ?? [];

  // Started but NOT awaited: the grid below renders from the cached listing
  // immediately, and each card's price streams into it when this resolves.
  const offers = listOffers(items.map((item) => item.slug));

  const facets: FacetView[] = (page.facets ?? [])
    .filter(
      (facet) => isToggleable(facet.key) && !lockedKeys.includes(facet.key),
    )
    .map((facet) => ({
      key: facet.key,
      label: facet.label,
      values: facet.values.map((value) => ({
        value: value.value,
        label: value.label,
        count: value.count,
        selected: query[facet.key as ToggleableKey] === value.value,
        href: toggleFacetHref(
          basePath,
          query,
          facet.key as ToggleableKey,
          value.value,
        ),
      })),
    }));

  return (
    <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
      <aside aria-label="Filtre" className="md:sticky md:top-28 md:self-start">
        <FacetPanel facets={facets} />
      </aside>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {page.total ?? items.length}{" "}
            {(page.total ?? items.length) === 1 ? "produs" : "produse"}
          </p>
          <SortLinks basePath={basePath} query={query} />
        </div>

        {items.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">{emptyMessage}</p>
            <Link
              href={basePath}
              className="text-primary focus-visible:ring-ring mt-3 inline-block rounded text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              Sterge filtrele
            </Link>
          </div>
        ) : (
          <ProductGrid items={items} offers={offers} />
        )}

        {page.nextCursor && (
          <div className="mt-8">
            <Link
              href={buildCatalogHref(basePath, query, {
                cursor: page.nextCursor,
              })}
              prefetch={false}
              className="border-border hover:bg-muted focus-visible:ring-ring inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              Pagina urmatoare
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** Reserves the listing's two-column box so the Suspense swap does not shift. */
export function ProductListingSkeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
      <div aria-hidden className="hidden md:block">
        <div className="bg-muted h-4 w-24 animate-pulse rounded" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-muted h-6 animate-pulse rounded" />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="bg-muted h-4 w-20 animate-pulse rounded" />
          <div className="bg-muted h-7 w-64 animate-pulse rounded" />
        </div>
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
