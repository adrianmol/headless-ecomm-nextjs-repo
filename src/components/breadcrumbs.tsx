import Link from "next/link";
import { JsonLd } from "@/components/json-ld";

export type Crumb = {
  name: string;
  /** Absent for the current page and for a level that has no page of its own. */
  href?: string;
};

/**
 * Breadcrumbs, with the matching `BreadcrumbList`.
 *
 * Both come from the same list so the page and its structured data cannot say
 * different things — the mismatch the plan warns gets a product suspended.
 *
 * `origin` makes the structured-data URLs absolute, which the vocabulary
 * requires. Without one the visible trail still renders and the structured
 * data is left out, rather than published with a guessed domain.
 */
export function Breadcrumbs({
  crumbs,
  origin,
}: {
  crumbs: readonly Crumb[];
  origin?: string;
}) {
  return (
    <nav aria-label="Ești aici" className="mb-6">
      <ol className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden>›</span>}
              {crumb.href && !current ? (
                <Link
                  href={crumb.href}
                  className="hover:text-foreground focus-visible:ring-ring rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  {crumb.name}
                </Link>
              ) : (
                <span aria-current={current ? "page" : undefined}>
                  {crumb.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {origin && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: crumbs.map((crumb, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: crumb.name,
              ...(crumb.href
                ? { item: new URL(crumb.href, origin).toString() }
                : {}),
            })),
          }}
        />
      )}
    </nav>
  );
}
