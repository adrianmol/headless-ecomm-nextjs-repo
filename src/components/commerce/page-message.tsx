import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared presentation for whole-page states: not found, unavailable, empty.
 *
 * A Server Component with no interactivity, so it costs no client JavaScript.
 * The interactive variants (retry buttons in error boundaries) compose this and
 * pass their own control in as `action`.
 *
 * Existing inline states in the cart and checkout pages are deliberately left
 * alone rather than migrated onto this: they work, they are covered by E2E and
 * axe, and rewriting them would fold unrelated churn into this change.
 */
export function PageMessage({
  title,
  description,
  reference,
  action,
  children,
}: {
  title: string;
  description: string;
  /** Support correlation id, e.g. an error digest. Never an error message. */
  reference?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-3">{description}</p>

      {action && <div className="mt-6">{action}</div>}

      {children}

      <Link
        href="/produse"
        className="focus-visible:ring-ring mt-8 rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Vezi tot catalogul
      </Link>

      {reference && (
        <p className="text-muted-foreground mt-8 text-xs">
          Referinta: <span className="font-mono">{reference}</span>
        </p>
      )}
    </main>
  );
}
