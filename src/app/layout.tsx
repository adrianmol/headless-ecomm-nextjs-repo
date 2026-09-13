import type { Metadata } from "next";
import "./globals.css";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WebVitals } from "@/components/web-vitals";
import { cn } from "@/lib/utils";

/**
 * `latin-ext` is required, not optional: Romanian needs ă â î ș ț, and the
 * `latin` subset does not contain them. Without it every product title and most
 * body copy silently falls back to a system font mid-word.
 */
const sans = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

/**
 * OEM part codes (CB435A, TN-2000, 1T02RY0NL0) are the thing buyers compare
 * character by character. A monospace face makes transposed digits visible and
 * stops 0/O and 1/l collapsing into each other.
 */
const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "REPrint — consumabile compatibile pentru imprimante",
    template: "%s | REPrint",
  },
  description:
    "Tonere, cartuse, unitati de cilindru si piese compatibile pentru imprimante Brother, HP, Canon, Kyocera, Xerox si altele.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={cn("font-sans", sans.variable, mono.variable)}>
      <body>
        {/*
          A client leaf that renders null. It sits in the layout because field
          metrics are wanted on every route, and it is the one exception to
          keeping client components out of layouts — it has no subtree to drag
          along with it.
        */}
        <WebVitals />

        {/* Server Component: navigation costs no client JavaScript. */}
        <SiteHeader />

        {/*
          Target for the header's skip link. Each page renders its own <main>,
          so this wrapper carries the id rather than duplicating the landmark.

          `tabIndex={-1}` is required, not decorative: a plain <div> cannot
          receive focus, so activating the skip link would move the URL fragment
          and the sequential-navigation start point but leave focus where it
          was — in the header. Screen reader users would hear the nav again.
          -1 makes it programmatically focusable without adding it to the tab
          order. `outline-none` suppresses a ring around the whole page body,
          which is not a useful focus indicator at that size.
        */}
        <div id="content" tabIndex={-1} className="outline-none">
          {children}
        </div>

        <SiteFooter />
      </body>
    </html>
  );
}
