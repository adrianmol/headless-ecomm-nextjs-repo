import Link from "next/link";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/cart", label: "Basket" },
] as const;

/**
 * Site header. A Server Component, so it adds no client JavaScript.
 *
 * **No basket count, deliberately.** A count is per-visitor data, so rendering
 * it in a layout shared by every route would either drag the cart read into
 * every page — including the cached catalog pages, breaking the rule that
 * catalog responses carry no session — or require a client-side cart store
 * subscribed globally, which the handoff rules out. The handoff explicitly
 * permits a plain Basket link instead, and that is what this is.
 *
 * No `aria-current` either: knowing the active route needs `usePathname`, which
 * would make this a Client Component in the layout — the exact regression the
 * rsc-boundaries skill warns about. Not worth client JS on every route for a
 * styling cue.
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
        Skip to content
      </a>

      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="focus-visible:ring-ring rounded font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
        >
          Storefront
        </Link>

        <nav aria-label="Main">
          <ul className="flex items-center gap-6 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="hover:text-foreground text-muted-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
