import type { ReactNode } from "react";
import Link from "next/link";
import { Headset } from "lucide-react";
import { COPYRIGHT_YEAR } from "@/components/site-footer";

/**
 * The checkout frame: logo, a way to reach a person, and nothing else.
 *
 * No menu, no category strip, no footer link farm. Every link out of a
 * checkout is an exit from the funnel, and a shopper who has started entering
 * an address wants the form, not the catalogue. The ways back are deliberate
 * and in-page: the step indicator and "Modifica cosul".
 *
 * The phone number stays because this shop confirms every order by phone: a
 * buyer with a question is better served by calling than by leaving. It is the
 * number from the owner's design file, as used in the site footer.
 *
 * The basket (/cos) is not in here — it lives under (shop) with the full menu,
 * because "keep shopping" is a legitimate thing to do from a basket.
 */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface flex min-h-dvh flex-col">
      <header className="border-border bg-background border-b">
        <a
          href="#content"
          className="bg-background focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded focus:px-3 focus:py-2 focus:ring-2"
        >
          Sari la continut
        </a>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className="focus-visible:ring-ring rounded text-lg font-extrabold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
          >
            RE<span className="text-primary">Print</span>
          </Link>
          <a
            href="tel:+40762095550"
            className="focus-visible:ring-ring hover:text-primary flex items-center gap-2 rounded text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <Headset aria-hidden className="text-muted-foreground size-4" />
            <span className="text-muted-foreground hidden sm:inline">
              Ai nevoie de ajutor?
            </span>
            <span className="sr-only sm:hidden">Suna-ne:</span>
            <span className="font-semibold tabular-nums">+40 762 095 550</span>
          </a>
        </div>
      </header>

      {/* Skip-link target; see ShopChrome for why it takes tabIndex -1. */}
      <div id="content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </div>

      <footer className="border-border text-muted-foreground border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs">
          © {COPYRIGHT_YEAR} REPrint Romania
        </p>
      </footer>
    </div>
  );
}
