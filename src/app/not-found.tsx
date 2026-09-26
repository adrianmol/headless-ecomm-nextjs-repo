import type { Metadata } from "next";
import { PageMessage } from "@/components/commerce/page-message";
import { ShopChrome } from "@/components/shop-chrome";

export const metadata: Metadata = {
  title: "Pagina nu a fost gasita",
  robots: { index: false, follow: false },
};

/**
 * Global 404. The product-specific ones under `(shop)/(catalog)` stay, because
 * they can offer a more useful message about a removed product.
 *
 * Wears the shop frame itself: it renders in the root layout, outside every
 * route group, so it would otherwise be the one page with no menu — and a
 * visitor on a dead link needs the menu more than anyone.
 */
export default function NotFound() {
  return (
    <ShopChrome>
      <PageMessage
        title="Nu am gasit aceasta pagina"
        description="Linkul poate fi vechi sau pagina a fost mutata."
      />
    </ShopChrome>
  );
}
