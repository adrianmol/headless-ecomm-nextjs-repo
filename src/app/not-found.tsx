import type { Metadata } from "next";
import { PageMessage } from "@/components/commerce/page-message";

export const metadata: Metadata = {
  title: "Pagina nu a fost gasita",
  robots: { index: false, follow: false },
};

/**
 * Global 404. The product-specific one at
 * `(catalog)/products/[slug]/not-found.tsx` stays, because it can offer a more
 * useful message about a removed product.
 */
export default function NotFound() {
  return (
    <PageMessage
      title="Nu am gasit aceasta pagina"
      description="Linkul poate fi vechi sau pagina a fost mutata."
    />
  );
}
