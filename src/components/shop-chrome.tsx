import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * The full storefront frame: header, menu and footer around a page.
 *
 * Shared by (shop)/layout.tsx and the root 404, which renders outside every
 * route group and would otherwise lose the navigation a lost visitor needs most.
 * Checkout deliberately does not use it; see (checkout)/layout.tsx.
 */
export function ShopChrome({ children }: { children: ReactNode }) {
  return (
    <>
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
    </>
  );
}
