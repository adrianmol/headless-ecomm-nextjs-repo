import type { Metadata } from "next";
import { PageMessage } from "@/components/commerce/page-message";

export const metadata: Metadata = {
  title: "Page not found",
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
      title="We couldn't find that page"
      description="The link may be out of date, or the page may have moved."
    />
  );
}
