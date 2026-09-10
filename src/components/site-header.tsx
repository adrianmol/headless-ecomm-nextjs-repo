import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog-taxonomy";

/**
 * Site header. A Server Component, so it adds no client JavaScript.
 *
 * **No basket count, deliberately.** A count is per-visitor data, so rendering
 * it in a layout shared by every route would either drag the cart read into
 * every page — including the cached catalog pages, breaking the rule that
 * catalog responses carry no session — or require a client-side cart store
 * subscribed globally, which the handoff rules out. A plain Cos link instead.
 *
 * No `aria-current` either: knowing the active route needs `usePathname`, which
 * would make this a Client Component in the layout — the exact regression the
 * rsc-boundaries skill warns about. Not worth client JS on every route for a
 * styling cue.
 *
 * The category row is a flat list of consumable kinds rather than the mega-menu
 * the original site uses. A dropdown here would be either a client island in
 * the layout or a CSS-hover menu that is unusable on touch; six links cost
 * nothing and are reachable in one tab.
 */
export function SiteHeader() {
  return (
    <header className="border-border bg-background sticky top-0 z-10 border-b">
      {/* First focusable element on the page: lets keyboard and screen reader
          users jump the nav instead of tabbing it on every navigation. */}
      <a
        href="#content"
        className="bg-background focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded focus:px-3 focus:py-2 focus:ring-2"
      >
        Sari la continut
      </a>

      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="focus-visible:ring-ring rounded text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
        >
          RE<span className="text-primary">Print</span>
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-5 text-sm">
          <Link
            href="/produse"
            className="hover:text-foreground text-muted-foreground focus-visible:ring-ring hidden rounded focus-visible:ring-2 focus-visible:outline-none sm:inline"
          >
            Toate produsele
          </Link>
          <Link
            href="/info/seap"
            className="hover:text-foreground text-muted-foreground focus-visible:ring-ring hidden rounded focus-visible:ring-2 focus-visible:outline-none sm:inline"
          >
            SEAP
          </Link>
          <Link
            href="/cos"
            className="border-border hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            Cos
          </Link>
        </nav>
      </div>

      <div className="border-border border-t">
        {/*
          Labelled distinctly from the footer's category nav. Two navigation
          landmarks sharing an accessible name is an a11y defect in its own
          right — a screen reader user gets two identical entries in the
          landmark list with no way to tell them apart.
        */}
        <nav
          aria-label="Categorii de produse"
          className="mx-auto max-w-6xl overflow-x-auto px-4"
        >
          <ul className="flex items-center gap-4 py-2 text-sm whitespace-nowrap">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/categorii/${category.slug}`}
                  className="hover:text-foreground text-muted-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
