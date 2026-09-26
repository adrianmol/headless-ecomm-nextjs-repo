import Link from "next/link";
import {
  Cylinder,
  Droplets,
  LayoutGrid,
  type LucideIcon,
  Package,
  Printer,
  Recycle,
  ScrollText,
  ShoppingBag,
  Wrench,
} from "lucide-react";
import { CATEGORIES } from "@/lib/catalog-taxonomy";

/** Keyed by slug; a category added without an icon falls back to a grid. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  tonere: Package,
  "cartuse-cerneala": Droplets,
  "piese-si-ansambluri": Wrench,
  "unitati-cilindru": Cylinder,
  role: ScrollText,
  accesorii: Recycle,
};

const focusRing =
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

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
    <header className="border-border bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 border-b backdrop-blur">
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
          className={`flex shrink-0 items-center gap-2 rounded text-lg font-extrabold tracking-tight ${focusRing}`}
        >
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg"
          >
            <Printer className="size-4.5" strokeWidth={2.25} />
          </span>
          <span>
            RE<span className="text-primary">Print</span>
          </span>
          <span className="text-muted-foreground hidden text-sm font-medium sm:inline">
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
          className="flex shrink-0 items-center gap-1 text-sm sm:gap-2"
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
            className={`text-foreground hover:bg-muted flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 font-medium transition-colors ${focusRing}`}
          >
            <LayoutGrid aria-hidden className="size-5" />
            {/* Icon-only on phones, but the name stays for screen readers. */}
            <span className="sr-only sm:not-sr-only">Echipamente</span>
          </Link>
          <Link
            href="/cos"
            className={`bg-foreground text-background flex h-11 items-center gap-2 rounded-full pr-5 pl-4 font-semibold transition-opacity hover:opacity-90 ${focusRing} focus-visible:ring-offset-2`}
          >
            <ShoppingBag aria-hidden className="size-5" />
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
          // Hidden scrollbar plus an edge fade on phones: the cut-off chip is the
          // cue that the strip scrolls. Six chips fit from `sm` up, so no fade.
          className="max-w-page mx-auto snap-x overflow-x-auto px-4 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex items-start gap-2 py-3 whitespace-nowrap sm:justify-center sm:gap-8">
            {CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category.slug] ?? LayoutGrid;
              return (
                <li key={category.slug} className="shrink-0 snap-start">
                  <Link
                    href={`/categorii/${category.slug}`}
                    className={`group flex w-20 flex-col items-center gap-1.5 rounded-lg p-1 ${focusRing}`}
                  >
                    <span
                      className="bg-accent text-accent-foreground group-hover:bg-primary group-hover:text-primary-foreground flex size-11 items-center justify-center rounded-full transition-colors"
                      aria-hidden
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="text-muted-foreground group-hover:text-foreground text-center text-[11px] leading-tight whitespace-normal">
                      {category.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
