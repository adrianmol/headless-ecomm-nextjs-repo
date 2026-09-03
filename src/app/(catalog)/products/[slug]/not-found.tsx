import type { Metadata } from "next";
import Link from "next/link";

/**
 * Soft 404: the prerendered shell has already committed HTTP 200, so `noindex`
 * is what actually keeps missing products out of search results. Remove it only
 * if the route is changed to resolve existence before streaming.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ProductNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that product</h1>
      <p className="text-muted-foreground mt-3">
        It may have been removed, or the link may be wrong.
      </p>
      <Link
        href="/products"
        className="mt-6 inline-block underline underline-offset-4"
      >
        Browse all products
      </Link>
    </main>
  );
}
