import Link from "next/link";

/**
 * Soft 404: the prerendered shell has already committed HTTP 200 (measured), so
 * `noindex` — not the status code — is what keeps missing products out of search
 * results. Making it a hard 404 means resolving existence before streaming,
 * which costs the static shell.
 *
 * **Deliberately exports no `metadata`.** Next already injects exactly one
 * `<meta name="robots" content="noindex">` when `notFound()` renders, including
 * on this 200 response — verified against the standalone production build. An
 * explicit `robots: { index: false, follow: false }` here does not replace that
 * tag, it *adds a second one*, which is how this route came to emit two
 * conflicting robots directives.
 *
 * Dropping it also restores `follow`, which is what we want: the escape link
 * below points at a real page, and telling crawlers not to follow it was
 * counterproductive.
 *
 * The `noindex` is load-bearing, so it is asserted in `e2e/seo.spec.ts` rather
 * than trusted. If a future Next version stops emitting it, that test fails and
 * an explicit tag goes back in.
 */
export default function ProductNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">
        We couldn&apos;t find that product
      </h1>
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
