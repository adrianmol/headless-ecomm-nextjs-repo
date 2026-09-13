import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog-taxonomy";

/**
 * Site footer, following the owner's design file: four columns on the dark green
 * ground, with a thin copyright bar beneath. A Server Component — no client
 * JavaScript.
 *
 * The contact details here come from the owner's design file and are used as
 * supplied. That distinction matters in this project: previous copy was rejected
 * twice for asserting business facts the storefront had no source for. A phone
 * number and a street address are exactly that kind of fact, so they are quoted
 * from the owner's own design rather than invented, and anything the design does
 * not state is still absent — no registration number, no bank details, no VAT id.
 *
 * The newsletter block from the design is **not** implemented. There is no
 * subscription endpoint in any contract available here, and a form that silently
 * discards an email address is worse than no form.
 *
 * Text on this ground is `--brand-muted-foreground` (#CFE4D8), which measures
 * 5.34:1 against the green — the muted grey used elsewhere would be unreadable
 * here, which is the usual way a dark footer fails contrast.
 */

/**
 * Deliberately a constant, not `new Date().getFullYear()`.
 *
 * The footer is prerendered, so reading the clock during render is rejected
 * outright by `cacheComponents` — and it would be wrong even if allowed: the
 * value would freeze at build time and quietly show the wrong year from every
 * January until the next deploy. A constant is at least honest about needing a
 * human, and shows up in a diff.
 */
const COPYRIGHT_YEAR = 2026;

const INFO_LINKS = [
  { href: "/info/livrare", label: "Livrare" },
  { href: "/info/termeni", label: "Termeni si conditii" },
  { href: "/info/despre-noi", label: "Despre noi" },
  { href: "/info/retur", label: "Politica de returnare" },
] as const;

const ABOUT_LINKS = [
  { href: "/info/seap", label: "Achizitii SEAP / SICAP" },
  { href: "/info/cash-back", label: "Cash back" },
  { href: "/promotii", label: "Promotii" },
  { href: "/produse", label: "Produse noi" },
] as const;

function FooterColumn({
  id,
  title,
  links,
}: {
  id: string;
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="text-sm font-bold text-white">
        {title}
      </h2>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-brand-muted-foreground focus-visible:ring-ring rounded hover:text-white hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-brand-dark mt-16 text-white">
      <div className="max-w-page mx-auto grid gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-lg font-extrabold tracking-tight">REPRINT</p>
          <p className="text-brand-muted-foreground mt-3 text-sm">
            Consumabile de calitate premium la pret de importator.
          </p>
        </div>

        <FooterColumn id="footer-info" title="Informatii" links={INFO_LINKS} />
        <FooterColumn
          id="footer-about"
          title="Despre noi"
          links={ABOUT_LINKS}
        />

        <div>
          <h2 className="text-sm font-bold text-white">Contact</h2>
          <ul className="text-brand-muted-foreground mt-4 space-y-2 text-sm">
            <li>
              {/* A real phone number is more useful as a link than as text. */}
              <a
                href="tel:+40762095550"
                className="focus-visible:ring-ring rounded hover:text-white hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                +40 762 095 550
              </a>
            </li>
            <li>Str. Cuza Vodă 49, Târgu Frumos, Iași</li>
          </ul>
        </div>
      </div>

      {/*
        Category links stay in the footer for crawlability, but below the
        design's four columns rather than replacing one of them.
      */}
      <div className="border-t border-white/15">
        <nav
          aria-labelledby="footer-categories"
          className="max-w-page mx-auto px-4 py-6"
        >
          <h2
            id="footer-categories"
            className="text-brand-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Categorii
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/categorii/${category.slug}`}
                  className="text-brand-muted-foreground focus-visible:ring-ring rounded hover:text-white hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/15">
        <p className="text-brand-muted-foreground max-w-page mx-auto px-4 py-5 text-center text-xs">
          © {COPYRIGHT_YEAR} REPrint Romania
        </p>
      </div>
    </footer>
  );
}
