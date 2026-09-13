import Link from "next/link";

/**
 * See the sibling not-found under produse-hub for why this exports no `metadata`:
 * Next emits the single `noindex` itself, and the root not-found's explicit
 * `robots` export would otherwise add a second.
 */
export default function HubCategoryNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Nu am gasit aceasta categorie</h1>
      <p className="text-muted-foreground mt-3">
        Este posibil sa fi fost redenumita sau linkul sa fie gresit.
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
