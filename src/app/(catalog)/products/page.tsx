import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { listProducts } from "@/commerce/catalog/queries";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/commerce/product-card";

export const metadata: Metadata = {
  title: "All products",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

/**
 * Fixed page size for the catalog listing. The skeleton and the loaded grid
 * must reserve the same number of card slots so the Suspense swap does not
 * shift the layout.
 */
const PAGE_SIZE = 2;

type ParsedParams = { ok: true; cursor?: string } | { ok: false };

function parseParams(raw: {
  [key: string]: string | string[] | undefined;
}): ParsedParams {
  const result: { cursor?: string } = {};

  if (raw.cursor !== undefined) {
    if (Array.isArray(raw.cursor) || raw.cursor === "") return { ok: false };
    result.cursor = raw.cursor;
  }

  return { ok: true, ...result };
}

function ListingMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-20 text-center">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-3">{description}</p>
      <Link
        href="/products"
        className="focus-visible:ring-ring mt-8 rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Browse all products
      </Link>
    </div>
  );
}

async function ProductListing({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const parsed = parseParams(raw);

  if (!parsed.ok) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-8 text-2xl font-semibold">All products</h1>
        <ListingMessage
          title="We couldn't load this page"
          description="The page link is not valid. Return to the first page of the catalogue and try again."
        />
      </main>
    );
  }

  let page;
  try {
    page = await listProducts(
      parsed.cursor
        ? { cursor: parsed.cursor, limit: PAGE_SIZE }
        : { limit: PAGE_SIZE },
    );
  } catch {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-8 text-2xl font-semibold">All products</h1>
        <ListingMessage
          title="We couldn't load this page"
          description="The product list is not available right now. Please try again later, or start from the first page."
        />
      </main>
    );
  }

  const { items, nextCursor } = page;

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-8 text-2xl font-semibold">All products</h1>
        <ListingMessage
          title="No more products"
          description="You've reached the end of the catalogue."
        />
      </main>
    );
  }

  const nextHref = nextCursor ? `/products?cursor=${encodeURIComponent(nextCursor)}` : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">All products</h1>
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((product, index) => (
          <li key={product.id}>
            <ProductCard
              slug={product.slug}
              title={product.title}
              image={product.images[0]}
              // One row on the widest breakpoint. The first card is normally the
              // LCP element, and lazy-loading it delays the metric this page is
              // measured on.
              priority={index < 4}
            />
          </li>
        ))}
      </ul>
      {nextHref && (
        <div className="mt-8">
          <Link
            href={nextHref}
            prefetch={false}
            className="focus-visible:ring-ring inline-flex h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:outline-none"
          >
            Next page
          </Link>
        </div>
      )}
    </main>
  );
}

function ProductListingSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">All products</h1>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: PAGE_SIZE }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}

export default function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<ProductListingSkeleton />}>
      <ProductListing searchParams={searchParams} />
    </Suspense>
  );
}
