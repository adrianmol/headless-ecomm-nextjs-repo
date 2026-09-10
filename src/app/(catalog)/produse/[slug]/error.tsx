"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route error boundary. Must be a Client Component — this is one of the few
 * legitimate 'use client' leaves, since it needs reset() and an effect.
 *
 * Imports nothing beyond React on purpose. An error boundary ships with the
 * route whether or not it renders, and this one is on the PDP — the route
 * closest to the client-JS budget. It previously imported `Button`, which pulls
 * `class-variance-authority` and Radix `Slot` into the PDP bundle to style a
 * button almost no visitor sees. Tailwind classes are CSS, not JavaScript.
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
      <h1 className="text-2xl font-semibold">A aparut o eroare</h1>
      <p className="text-muted-foreground mt-3">
        Nu am putut incarca acest produs. Te rugam sa incerci din nou.
      </p>
      <div className="mt-6">
        <button
          type="button"
          onClick={reset}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          Incearca din nou
        </button>
      </div>

      {/*
        An escape route, not decoration. With only "Try again", a persistently
        failing product is a dead end: the shopper can either keep retrying or
        leave the site. This matches the global error boundary's behaviour.
      */}
      <p className="mt-8">
        <Link
          href="/produse"
          className="focus-visible:ring-ring rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Vezi tot catalogul
        </Link>
      </p>
      {error.digest && (
        <p className="text-muted-foreground mt-6 text-xs">
          Referinta: {error.digest}
        </p>
      )}
    </main>
  );
}
