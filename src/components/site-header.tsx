import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog-taxonomy";

/**
 * Site header, following the owner's REPrint design file: a white bar with the
 * wordmark, a wide search field, an account link and a filled basket pill, over
 * a strip of circular category chips.
 *
 * A Server Component, so it adds no client JavaScript.
 *
 * **No basket count, deliberately — and this is a departure from the design,
 * which shows `Coș (0)`.** A count is per-visitor data, so rendering it in a
 * layout shared by every route would either drag a cart read into every page,
 * including the cached catalog pages that must carry no session, or need a
 * globally subscribed client cart store. Both were rejected as a recorded
 * decision. A hardcoded `(0)` was the other option and is worse: it is wrong the
 * moment anything is in the basket.
 *
 * No `aria-current` either: knowing the active route needs `usePathname`, which
 * would make this a Client Component in the layout — the exact regression the
 * rsc-boundaries skill warns about.
 *
 * The search field is a plain GET form, so it works without JavaScript and is a
 * real form rather than a decorative box. It targets /produse, which validates
 * its own query parameters.
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

      <div className="max-w-page mx-auto flex h-16 items-center gap-4 px-4 sm:gap-8">
        <Link
          href="/"
          className="focus-visible:ring-ring shrink-0 rounded text-lg font-extrabold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
        >
          RE<span className="text-primary">Print</span>
          <span className="text-muted-foreground ml-1.5 hidden text-sm font-medium sm:inline">
            Romania
          </span>
        </Link>

        {/*
          The design puts a search field here. It is **deliberately absent**, and
          this is the third time search has been declined in this project for the
          same reason: nothing can answer it. `parseCatalogQuery` accepts no text
          parameter, and the HUB catalog contract exposes category, product-by-key
          and live-pricing endpoints with no search among them.

          A `role="search"` box that discards what a buyer types is worse than no
          box: someone pastes a part code, presses enter, and lands on the
          unfiltered catalogue with no explanation.

          There is a contract-supported path to most of it, which the design's own
          placeholder points at — "sau cod produs". `GET /product/{sku}` resolves
          an exact code, so a lookup that redirects to the product and otherwise
          says so is buildable today. Full-text search over names is not, and
          needs a backend endpoint. Left as an open decision rather than faked.
        */}
        <div className="min-w-0 flex-1" />

        <nav
          aria-label="Principal"
          className="flex shrink-0 items-center gap-3 text-sm sm:gap-5"
        >
          {/*
            The design has "Contul meu" here. Omitted: there is no account
            feature in this storefront and none in any available contract — the
            plan lists customer accounts as later scope. A header link to a 404
            is worse than a missing link.
          */}
          {/*
            Points at /modele, the HUB-backed catalogue browser, because that is the
            entry point that works against the live catalogue. HUB has no
            "list all products" endpoint — products are reachable only through a
            category — so an "all products" page cannot exist on that data.
          */}
          <Link
            href="/modele"
            className="text-primary focus-visible:ring-ring hidden rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none sm:inline"
          >
            Echipamente
          </Link>
          <Link
            href="/cos"
            className="bg-foreground text-background focus-visible:ring-ring rounded-full px-4 py-2 font-semibold hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
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
          className="max-w-page mx-auto overflow-x-auto px-4"
        >
          <ul className="flex items-start gap-6 py-3 whitespace-nowrap sm:gap-9">
            {CATEGORIES.map((category) => (
              <li key={category.slug} className="shrink-0">
                <Link
                  href={`/categorii/${category.slug}`}
                  className="group focus-visible:ring-ring flex w-20 flex-col items-center gap-1.5 rounded focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span
                    className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-full text-xs font-bold group-hover:brightness-95"
                    aria-hidden
                  >
                    {category.abbr}
                  </span>
                  <span className="text-muted-foreground group-hover:text-foreground text-center text-[11px] leading-tight whitespace-normal">
                    {category.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
