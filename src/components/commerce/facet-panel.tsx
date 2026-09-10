import Link from "next/link";
import { cn } from "@/lib/utils";

export type FacetValueView = {
  value: string;
  label: string;
  count: number;
  /** Href that applies (or clears) this value. Built by the caller. */
  href: string;
  selected: boolean;
};

export type FacetView = {
  key: string;
  label: string;
  values: readonly FacetValueView[];
};

/**
 * Catalog refinements.
 *
 * **Plain links, not checkboxes with JavaScript.** Every state is a real URL,
 * which means filtered listings are shareable, linkable, indexable, and
 * survive the back button — and the panel costs zero client JS against the
 * 170 kB budget (docs/architecture.md §8). A filter panel is the classic place
 * a storefront accidentally ships a client-side store into every catalog page.
 *
 * Labels come from the backend facet response, never from a local code-to-prose
 * map: the set of manufacturers and printer brands grows with the catalog, and
 * a local map would quietly render new values as raw slugs.
 */
export function FacetPanel({ facets }: { facets: readonly FacetView[] }) {
  if (facets.length === 0) return null;

  return (
    <div className="space-y-6">
      {facets.map((facet) => (
        <section key={facet.key} aria-labelledby={`facet-${facet.key}`}>
          <h2
            id={`facet-${facet.key}`}
            className="text-xs font-semibold tracking-wide uppercase"
          >
            {facet.label}
          </h2>
          <ul className="mt-2 space-y-0.5">
            {facet.values.map((value) => (
              <li key={value.value}>
                <Link
                  href={value.href}
                  scroll={false}
                  // A selected facet is announced, not just coloured — the
                  // colour difference alone is invisible to a screen reader and
                  // marginal for anyone not comparing two states side by side.
                  aria-current={value.selected ? "true" : undefined}
                  className={cn(
                    "focus-visible:ring-ring flex items-center justify-between gap-2 rounded px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none",
                    value.selected
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="truncate">
                    {value.selected && (
                      <span aria-hidden className="mr-1">
                        ✕
                      </span>
                    )}
                    {value.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {value.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
