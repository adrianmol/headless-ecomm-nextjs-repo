"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Route error boundary. Must be a Client Component — this is one of the few
 * legitimate 'use client' leaves, since it needs reset() and an effect.
 *
 * Deliberately shows no error detail. `error.message` is backend prose that is
 * unlocalised and may name internal fields; in production Next replaces it with
 * a digest anyway. The digest is surfaced so support can correlate a report
 * with server logs.
 */
export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with the real reporter once observability lands (architecture §8).
    console.error("product route error", error.digest);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground mt-3">
        We couldn&apos;t load this product. Please try again.
      </p>
      <div className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </div>
      {error.digest && (
        <p className="text-muted-foreground mt-6 text-xs">
          Reference: {error.digest}
        </p>
      )}
    </main>
  );
}
