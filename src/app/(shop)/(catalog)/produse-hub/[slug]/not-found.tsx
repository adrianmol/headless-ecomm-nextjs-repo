import Link from "next/link";

/**
 * Soft 404, and `noindex` is what keeps it out of search results rather than the
 * status code. The response has already committed 200 by the time the product is
 * known to be missing — the same measured condition the provisional PDP documents.
 *
 * **Deliberately exports no `metadata`.** Next injects exactly one
 * `<meta name="robots" content="noindex">` when `notFound()` renders. Without this
 * file the route fell back to the root not-found, which *does* export `robots`, and
 * the page then carried three robots directives — measured. Adding an explicit one
 * here would put it back to two.
 */
export default function HubProductNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Nu am gasit acest produs</h1>
      <p className="text-muted-foreground mt-3">
        Este posibil sa fi fost retras din catalog sau linkul sa fie gresit.
      </p>
      <Link
        href="/produse"
        className="focus-visible:ring-ring mt-8 inline-block rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Vezi tot catalogul
      </Link>
    </main>
  );
}
