import { Suspense } from "react";
import Link from "next/link";
import { listProducts } from "@/commerce/catalog/queries";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/commerce/product-card";
import { Button } from "@/components/ui/button";

const PREVIEW_COUNT = 4;

/**
 * The first page of the catalog, from the same cached `listProducts` scope the
 * listing page uses — so this adds no new backend surface and no new cache
 * policy. It is the only catalog read the OpenAPI contract offers.
 *
 * Named a preview, not "featured", and labelled `From the catalogue` in the UI.
 * There is no `featured`/`promoted` flag in openapi/commerce.yaml, so calling
 * these products featured would assert curation the backend does not perform.
 * Curated merchandising is a backend capability this storefront cannot invent.
 */
async function CataloguePreview() {
  const { items } = await listProducts({ limit: PREVIEW_COUNT });

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        Our catalogue is being updated. Please check back shortly.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {items.slice(0, PREVIEW_COUNT).map((product, index) => (
        <li key={product.id}>
          <ProductCard
            slug={product.slug}
            title={product.title}
            image={product.images[0]}
            // Above the fold on the landing page, so the first row must not
            // lazy-load — it is the LCP candidate.
            priority={index < PREVIEW_COUNT}
          />
        </li>
      ))}
    </ul>
  );
}

/** Must match the loaded grid's box exactly, or the swap costs CLS. */
function CataloguePreviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: PREVIEW_COUNT }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12">
        {/*
          Copy states only what this storefront can actually support: that the
          catalogue is browsable and that price and stock are read live per
          product, which is literally how the PDP works.

          It deliberately makes no claim about materials, provenance,
          manufacturing, or restocking policy. None of that exists in
          openapi/commerce.yaml, so asserting it here would be inventing
          merchandising — and, for a real shop, publishing claims that may be
          untrue. Marketing copy is owner-supplied content; when a CMS or a
          content field exists, read it from there.
        */}
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Shop the collection
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl text-lg">
          Browse the full catalogue. Pricing and availability are shown live on
          every product page.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href="/products">Shop all products</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">From the catalogue</h2>
          <Link
            href="/products"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          >
            View all
          </Link>
        </div>

        <Suspense fallback={<CataloguePreviewSkeleton />}>
          <CataloguePreview />
        </Suspense>
      </section>
    </main>
  );
}
