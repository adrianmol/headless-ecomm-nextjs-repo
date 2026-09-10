import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog-taxonomy";

/**
 * Site footer. A Server Component — no client JavaScript.
 *
 * Deliberately carries no company address, phone number, registration number,
 * or bank details. Those are real-world facts about a real business and this
 * storefront has no source for them: inventing plausible ones would put false
 * contact and legal-entity information on every page of a shop. They belong in
 * owner-supplied content, read from a CMS field when one exists.
 *
 * The same applies to the newsletter form on the original site: there is no
 * subscription endpoint in the contract, and a form that silently discards an
 * email address is worse than no form.
 */
export function SiteFooter() {
  return (
    <footer className="border-border bg-muted/40 mt-16 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="text-lg font-bold tracking-tight">
            RE<span className="text-primary">Print</span>
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Consumabile compatibile pentru imprimante: tonere, cartuse, unitati
            de cilindru si piese de schimb.
          </p>
        </div>

        <nav aria-labelledby="footer-categories">
          <h2 id="footer-categories" className="text-sm font-semibold">
            Categorii
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/categorii/${category.slug}`}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-info">
          <h2 id="footer-info" className="text-sm font-semibold">
            Informatii
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              <Link
                href="/produse"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
              >
                Toate produsele
              </Link>
            </li>
            <li>
              <Link
                href="/info/seap"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
              >
                Achizitii SEAP / SICAP
              </Link>
            </li>
            <li>
              <Link
                href="/cos"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
              >
                Cosul meu
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
