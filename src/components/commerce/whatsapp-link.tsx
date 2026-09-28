import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Discută pe WhatsApp". A link, so it costs no client JavaScript.
 *
 * The plan allows it **once per page** — beside add-to-cart on the product
 * page, and once in the cart. That is the caller's rule to keep; rendering it
 * on every card would turn a way to ask a question into noise.
 *
 * `href` arrives finished (see src/lib/whatsapp.ts) because the number is
 * server configuration, and components do not read configuration.
 */
export function WhatsAppLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      // `noreferrer` keeps the page URL — which in the cart is per-visitor —
      // out of the request to a third party.
      rel="noopener noreferrer"
      className={cn(
        "border-border hover:bg-muted focus-visible:ring-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
    >
      <MessageCircle aria-hidden className="size-4" />
      Discută pe WhatsApp
      <span className="sr-only"> (se deschide într-o fereastră nouă)</span>
    </a>
  );
}
