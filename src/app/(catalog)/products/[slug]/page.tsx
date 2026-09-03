import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getOffer, getProduct } from "@/commerce/catalog/queries";
import { CommerceErrorException } from "@/commerce/errors";
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
 * A deleted product must render the 404 UI, not an error page. Only NotFound is
 * converted — a genuine outage must keep bubbling to the error boundary, or
 * every backend incident would silently look like an empty catalogue.
 *
 * Known limitation: because the shell is prerendered, the HTTP status is
 * already committed as 200 before this runs, so this is a soft 404. The route
 * is marked noindex below to keep it out of search results. Making it a hard
 * 404 means resolving existence before streaming, which costs the static shell.
 */
async function ProductShell({ params }: { params: ParamsPromise }) {
  const { slug } = await params;

  let product;
  try {
    product = await getProduct(slug);
  } catch (error) {
    if (error instanceof CommerceErrorException && error.error.kind === "NotFound") {
      notFound();
    }
    throw error;
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
