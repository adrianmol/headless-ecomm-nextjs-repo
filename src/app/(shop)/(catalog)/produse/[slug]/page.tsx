import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addToCartAction } from "@/commerce/cart/actions";
import { getOffer, getProduct } from "@/commerce/catalog/queries";
import { serverEnv } from "@/lib/env";
import { formatYield } from "@/lib/locale";
import { categoryByKind } from "@/lib/catalog-taxonomy";
import { AddToCart } from "@/components/commerce/add-to-cart";
import { Price, PriceSkeleton } from "@/components/commerce/price";
import {
  StockBadge,
  StockBadgeSkeleton,
} from "@/components/commerce/stock-badge";
import { PriceTiers } from "@/components/commerce/price-tiers";
import { CompatList } from "@/components/commerce/compat-list";

/**
 * The PDP pattern from docs/architecture.md §5.
 *
 * Shell (title, images, specifications, compatibility) comes from a cached
 * `use cache` scope and is part of the static shell. Price, VAT, tiers and
 * stock are uncached and stream in at request time behind Suspense. The result
 * is a static-fast first paint that is structurally incapable of showing a
 * stale price.
 *
 * All four volatile figures stream in *one* boundary, deliberately. Splitting
 * price from stock would let them arrive a frame apart and briefly display a
 * combination the backend never returned — "in stoc" beside a price that has
 * since been withdrawn.
 */

type ParamsPromise = PageProps<"/produse/[slug]">["params"];

export async function generateMetadata({
  params,
}: PageProps<"/produse/[slug]">): Promise<Metadata> {
  const { slug } = await params;

  const product = await getProduct(slug);
  if (!product) {
    // Let the not-found segment provide the metadata and UI. Returning metadata
    // here too would emit duplicate <meta name="robots"> tags.
    notFound();
  }

  const env = serverEnv();
  const origin = env.STOREFRONT_URL;
  if (!origin) {
    throw new Error("STOREFRONT_URL must be configured for product metadata");
  }
  const base = new URL(origin);
  const path = `/produse/${product.slug}`;
  const hero = product.images[0];

  return {
    title: product.title,
    description: product.description,
    metadataBase: base,
    alternates: { canonical: path },
    openGraph: {
      title: product.title,
      description: product.description,
      url: path,
      siteName: "REPrint",
      locale: "ro_RO",
      images: hero
        ? [
            {
              url: hero.url,
              alt: hero.alt,
              width: hero.width,
              height: hero.height,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description: product.description,
      images: hero ? [hero.url] : [],
    },
  };
}

/** Specifications table. Cached shell data — none of it is volatile. */
function Specifications({
  attributes,
  kindLabel,
}: {
  attributes: NonNullable<Awaited<ReturnType<typeof getProduct>>>["attributes"];
  kindLabel?: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [];

  if (kindLabel) rows.push({ label: "Tip", value: kindLabel });
  if (attributes?.yieldPages !== undefined) {
    rows.push({
      label: "Randament",
      value: formatYield(attributes.yieldPages),
    });
  }
  if (attributes?.manufacturer) {
    rows.push({ label: "Producator", value: attributes.manufacturer });
  }
  if (attributes?.isOriginal !== undefined) {
    rows.push({
      label: "Tip produs",
      value: attributes.isOriginal ? "Original (OEM)" : "Compatibil",
    });
  }
  if (attributes?.oemCodes && attributes.oemCodes.length > 0) {
    rows.push({
      label: "Coduri echivalente",
      // Verbatim and monospaced: this is the string a buyer matches against
      // the label on the cartridge they are replacing.
      value: (
        <span className="font-mono">{attributes.oemCodes.join(", ")}</span>
      ),
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="specs-heading">
      <h2 id="specs-heading" className="text-base font-semibold">
        Specificatii
      </h2>
      <dl className="border-border mt-3 divide-y rounded-lg border text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-4 px-3 py-2">
            <dt className="text-muted-foreground w-40 shrink-0">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The three cached shell components below all return `null` for a missing
 * product, so the route falls through to its not-found segment rather than an
 * error page. Only NotFound is converted that way — a genuine outage must keep
 * bubbling to the error boundary, or every backend incident would silently look
 * like an empty catalogue.
 *
 * Known limitation: because the shell is prerendered, the HTTP status is
 * already committed as 200 before these run, so this is a soft 404. The route
 * is marked noindex in generateMetadata to keep it out of search results.
 */
async function ProductMedia({ params }: { params: ParamsPromise }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return null;

  const hero = product.images[0];

  return (
    <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
      {hero && (
        <Image
          src={hero.url}
          alt={hero.alt}
          width={hero.width}
          height={hero.height}
          sizes="(min-width: 768px) 45vw, 100vw"
          priority
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

async function ProductHeader({ params }: { params: ParamsPromise }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return null;

  const category = categoryByKind(product.kind);

  return (
    <div>
      {category && (
        <Link
          href={`/categorii/${category.slug}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {category.name}
        </Link>
      )}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {product.title}
      </h1>
      {product.description && (
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {product.description}
        </p>
      )}
    </div>
  );
}

/**
 * Specifications and compatibility, full width below the two columns because
 * both are long lists that read badly in a narrow column.
 *
 * A third boundary calling `getProduct` looks wasteful but is not: the query is
 * a `use cache` scope, so all three shell components share one resolved value
 * and one upstream request.
 */
async function ProductDetails({ params }: { params: ParamsPromise }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return null;

  const category = categoryByKind(product.kind);

  return (
    <>
      <Specifications
        attributes={product.attributes}
        kindLabel={category?.name}
      />
      <CompatList
        brands={(product.compatibility ?? []).map((entry) => ({
          brandSlug: entry.printerBrand.slug,
          brandName: entry.printerBrand.name,
          models: entry.printerModels,
        }))}
      />
    </>
  );
}

async function LiveOffer({ params }: { params: ParamsPromise }) {
  const { slug } = await params;
  const offer = await getOffer(slug);

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <Price
        price={offer.price}
        priceExVat={offer.priceExVat}
        vatRate={offer.vatRate}
        compareAtPrice={offer.compareAtPrice}
      />

      <StockBadge
        className="mt-3"
        inStock={offer.availability.inStock}
        quantity={offer.availability.quantity}
        showQuantity
      />

      {/*
        Add-to-cart lives inside the streamed offer, not the cached shell: the
        button must reflect live stock. Putting it in the shell would cache a
        stale enabled/disabled state and let shoppers add sold-out items.
      */}
      <AddToCart
        variantId={offer.variantId}
        inStock={offer.availability.inStock}
        action={addToCartAction}
      />

      {offer.priceTiers && offer.priceTiers.length > 0 && (
        <PriceTiers tiers={offer.priceTiers} />
      )}
    </div>
  );
}

/**
 * Must reserve the exact box <LiveOffer> occupies, or the swap costs CLS
 * against the 0.05 budget. Tiers are omitted here on purpose: most products
 * have none, so reserving space for a table would leave a permanent gap on the
 * majority of pages to avoid a shift on a minority of them.
 */
function LiveOfferSkeleton() {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <PriceSkeleton />
      <StockBadgeSkeleton className="mt-3" />
      <div className="bg-muted mt-4 h-10 animate-pulse rounded-md" />
    </div>
  );
}

function ProductMediaSkeleton() {
  return <div className="bg-muted aspect-square animate-pulse rounded-lg" />;
}

function ProductHeaderSkeleton() {
  return (
    <div>
      <div className="bg-muted h-4 w-20 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-9 w-4/5 animate-pulse rounded" />
      <div className="bg-muted mt-3 h-4 w-full animate-pulse rounded" />
    </div>
  );
}

/**
 * `params` is deliberately NOT awaited here. Awaiting it at page level is a
 * runtime data access outside any Suspense boundary, which blocks the whole
 * route from prerendering. Passing the promise down lets each boundary resolve
 * it independently and keeps the static shell intact.
 *
 * Layout: image left, title and the live offer stacked right, specifications
 * and compatibility full width beneath. The offer sits directly under the title
 * rather than in its own grid row, so price and stock are never pushed below
 * the fold by a tall product image.
 */
export default function ProductPage({ params }: PageProps<"/produse/[slug]">) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        <Suspense fallback={<ProductMediaSkeleton />}>
          <ProductMedia params={params} />
        </Suspense>

        <div>
          <Suspense fallback={<ProductHeaderSkeleton />}>
            <ProductHeader params={params} />
          </Suspense>

          <div className="mt-6">
            <Suspense fallback={<LiveOfferSkeleton />}>
              <LiveOffer params={params} />
            </Suspense>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <ProductDetails params={params} />
      </Suspense>
    </main>
  );
}
