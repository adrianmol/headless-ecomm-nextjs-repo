import { Suspense } from "react";
import type { Metadata } from "next";
import { listProducts } from "@/commerce/catalog/queries";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/commerce/product-card";

export const metadata: Metadata = {
  title: "All products",
};

/**
 * Cached listing. `listProducts` is a `use cache` scope tagged `product-list`,
 * so this grid is part of the static shell and is invalidated by the backend's
 * publish webhook rather than by a short TTL.
 */
async function ProductGrid() {
  const { items } = await listProducts();

  if (items.length === 0) {
    return <p className="text-muted-foreground">No products yet.</p>;
  }

  return (
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
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">All products</h1>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductGrid />
      </Suspense>
    </main>
  );
}
