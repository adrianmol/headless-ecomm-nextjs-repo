import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { listProducts } from "@/commerce/catalog/queries";
import type { Product } from "@/commerce/catalog/queries";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/commerce/product-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "All products",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

/**
 * Fixed page size for the catalog listing. The skeleton and the loaded grid
 * must reserve the same number of card slots so the Suspense swap does not
 * shift the layout, including a terminal page that contains fewer than this
 * number of products.
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

function ProductListingLayout({
  children,
  next,
}: {
  children: React.ReactNode;
  next: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">All products</h1>
      <div className="relative">{children}</div>
      <div className="mt-8 h-10">{next}</div>
    </main>
  );
}

function ProductListingMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
      <div className="max-w-xl text-center">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-3">{description}</p>
        <Link
          href="/products"
          className="focus-visible:ring-ring mt-8 inline-block rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Browse all products
        </Link>
      </div>
    </div>
  );
}

function ProductGrid({
  items,
  skeleton,
  className,
}: {
  items?: Product[];
  skeleton?: boolean;
  className?: string;
}) {
  if (skeleton) {
    return (
      <ul
        className={cn(
          "grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4",
          className,
        )}
      >
        {Array.from({ length: PAGE_SIZE }, (_, i) => (
          <li key={i}>
            <ProductCardSkeleton />
          </li>
        ))}
      </ul>
    );
  }

  const products = items ?? [];
  const placeholders = Math.max(0, PAGE_SIZE - products.length);

  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            slug={product.slug}
            title={product.title}
            image={product.images[0]}
            priority={index < 4}
          />
        </li>
      ))}
      {Array.from({ length: placeholders }, (_, i) => (
        <li key={`placeholder-${i}`} className="invisible" aria-hidden="true">
          <ProductCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

function NextPageLink({ cursor }: { cursor: string }) {
  return (
    <Link
      href={`/products?cursor=${encodeURIComponent(cursor)}`}
      prefetch={false}
      className="focus-visible:ring-ring inline-flex h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:outline-none"
    >
      Next page
    </Link>
  );
}

function NextPagePlaceholder({ skeleton = false }: { skeleton?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 items-center rounded-md px-4 py-2 text-sm font-medium",
        skeleton ? "bg-muted text-transparent animate-pulse" : "invisible",
      )}
      aria-hidden="true"
    >
      Next page
    </span>
  );
}

function ProductListingSkeleton() {
  return (
    <ProductListingLayout next={<NextPagePlaceholder skeleton />}>
      <ProductGrid skeleton />
    </ProductListingLayout>
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
      <ProductListingLayout next={<NextPagePlaceholder />}>
        <ProductGrid items={[]} className="invisible" />
        <ProductListingMessage
          title="We couldn't load this page"
          description="The page link is not valid. Return to the first page of the catalogue and try again."
        />
      </ProductListingLayout>
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
      <ProductListingLayout next={<NextPagePlaceholder />}>
        <ProductGrid items={[]} className="invisible" />
        <ProductListingMessage
          title="We couldn't load this page"
          description="The product list is not available right now. Please try again later, or start from the first page."
        />
      </ProductListingLayout>
    );
  }

  const { items, nextCursor } = page;

  if (items.length === 0) {
    return (
      <ProductListingLayout next={<NextPagePlaceholder />}>
        <ProductGrid items={[]} className="invisible" />
        <ProductListingMessage
          title="No more products"
          description="You've reached the end of the catalogue."
        />
      </ProductListingLayout>
    );
  }

  return (
    <ProductListingLayout
      next={
        nextCursor ? (
          <NextPageLink cursor={nextCursor} />
        ) : (
          <NextPagePlaceholder />
        )
      }
    >
      <ProductGrid items={items} />
    </ProductListingLayout>
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
