import { ViewTransition, type ReactNode } from "react";

/**
 * A template, not the layout: a template remounts on every navigation, so its
 * <ViewTransition> sees the old page exit and the new one enter. A layout
 * persists and would never fire either. Header, footer and the cart toast stay
 * in the layout, outside this, and hold still.
 *
 * `default="none"`: only navigations animate the page. A basket refresh after
 * a quantity change is a transition too, and must not fade the whole page.
 */
export default function ShopTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}
