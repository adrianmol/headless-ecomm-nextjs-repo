import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { WebVitals } from "@/components/web-vitals";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: {
    default: "Storefront",
    template: "%s | Storefront",
  },
  description: "Headless commerce storefront.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
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
      </body>
    </html>
  );
}
