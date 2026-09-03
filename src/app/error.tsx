"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Global route error boundary. A Client Component because `reset` and the
 * reporting effect require it — one of the few legitimate cases.
 *
 * **Imports nothing but `next/link` on purpose.** An error boundary is part of
 * every route's client bundle, whether or not it ever renders. The first
 * version imported `Button` and `PageMessage`, which pulled Radix Slot, `cva`
 * and their subtrees client-side and cost ~20 kB gzipped on *every* page — for
 * markup almost no visitor sees. Plain elements and Tailwind classes (CSS, not
 * JavaScript) look identical for no bundle cost.
 *
 * Keep it that way: adding a shared component import here is a budget
 * regression that no single page will appear to cause.
 *
 * Shows no error detail. `error.message` is backend prose — unlocalised, and it
 * may name internal fields. In production Next replaces it with a digest
 * anyway. The digest is surfaced so a customer report can be matched to a log
 * line.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Swap for the real reporter once a collector exists; `onRequestError` in
    // src/instrumentation.ts already records the server side of this.
    console.error("route error", error.digest);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground mt-3">
        We couldn&apos;t load this page. Trying again often works — nothing you
        have added to your basket is lost.
      </p>

      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring mt-6 rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        Try again
      </button>

      <Link
        href="/products"
        className="focus-visible:ring-ring mt-8 rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Browse all products
      </Link>

      {error.digest && (
        <p className="text-muted-foreground mt-8 text-xs">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
