import type { ReactNode } from "react";
import { ShopChrome } from "@/components/shop-chrome";

/** Every customer-facing route except checkout: catalogue, basket, info. */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return <ShopChrome>{children}</ShopChrome>;
}
