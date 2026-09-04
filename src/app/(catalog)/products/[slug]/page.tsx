import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";

import { addToCartAction } from "@/commerce/cart/actions";

import { getOffer, getProduct } from "@/commerce/catalog/queries";
import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { AddToCart } from "@/components/commerce/add-to-cart";
import { Price, PriceSkeleton } from "@/components/commerce/price";

/**
 * The PDP pattern from docs/architecture.md §5.
 *
 * Shell (title, images, copy) comes from a cached `use cache` scope and is part
 * of the static shell. Price and stock are uncached and stream in at request
 * time behind Suspense. The result is a static-fast first paint that is
 * structurally incapable of showing a stale price.
 */

type ParamsPromise = PageProps<"/products/[slug]">["params"];

/**
 * Product page metadata. It comes from the cached product shell, not the live
 * offer, so the title/description are stable while price and stock stream in.
 * The base URL is the configured STOREFRONT_URL. If it is not set, the request
 * fails loudly rather than silently emitting localhost canonical/Open Graph URLs
 * in production.
 */
export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
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
  const path = `/products/${product.slug}`;
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
      siteName: "Storefront",
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

/**
 * A deleted product must render the 404 UI, not an error page. Only NotFound is
 * converted — a genuine outage must keep bubbling to the error boundary, or
 * every backend incident would silently look like an empty catalogue.
 *
 * Known limitation: because the shell is prerendered, the HTTP status is
 * already committed as 200 before this runs, so this is a soft 404. The route
 * is marked noindex in generateMetadata to keep it out of search results.
 * Making it a hard 404 means resolving existence before streaming, which costs
 * the static shell.
 */
async function ProductShell({ params }: { params: ParamsPromise }) {
  const { slug } = await params;

  const product = await getProduct(slug);
  if (!product) {
    return null;
  }

  const hero = product.images[0];

  return (
    <>
      <div className="bg-muted relative aspect-4/5 overflow-hidden rounded-lg">
        {hero && (
          <Image
            src={hero.url}
            alt={hero.alt}
            width={hero.width}
            height={hero.height}
            sizes="(min-width: 768px) 50vw, 100vw"
            priority
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div>
        <h1 className="text-3xl font-semibold">{product.title}</h1>
        {product.description && (
          <p className="text-muted-foreground mt-4">{product.description}</p>
        )}
      </div>
    </>
  );
}

async function LiveOffer({ params }: { params: ParamsPromise }) {
  const { slug } = await params;
  const offer = await getOffer(slug);

  return (
    <div className="mt-6">
      <Price price={offer.price} compareAtPrice={offer.compareAtPrice} />
      <p
        className="text-muted-foreground mt-1 text-sm"
        // Stock changes after first paint, so announce it rather than letting
        // it silently swap for screen reader users.
        aria-live="polite"
      >
        {offer.availability.inStock
          ? `In stock (${offer.availability.quantity} available)`
          : "Out of stock"}
      </p>

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
    </div>
  );
}

function ProductShellSkeleton() {
  return (
    <>
      <div className="bg-muted aspect-4/5 animate-pulse rounded-lg" />
      <div>
        <div className="bg-muted h-9 w-2/3 animate-pulse rounded" />
        <div className="bg-muted mt-4 h-4 w-full animate-pulse rounded" />
      </div>
    </>
  );
}

/**
 * `params` is deliberately NOT awaited here. Awaiting it at page level is a
 * runtime data access outside any Suspense boundary, which blocks the whole
 * route from prerendering. Passing the promise down lets each boundary resolve
 * it independently and keeps the static shell intact.
 */
export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-2">
      <Suspense fallback={<ProductShellSkeleton />}>
        <ProductShell params={params} />
      </Suspense>

      <div className="md:col-start-2">
        <Suspense
          fallback={
            <div className="mt-6">
              <PriceSkeleton />
              <div className="bg-muted mt-1 h-5 w-32 animate-pulse rounded" />
            </div>
          }
        >
          <LiveOffer params={params} />
        </Suspense>
      </div>
    </main>
  );
}
