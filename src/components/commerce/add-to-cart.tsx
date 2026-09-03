"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { CartAction, CartFeedback } from "@/lib/cart-feedback";
import { formatMoney } from "@/lib/money";

/**
 * Client leaf. The Server Action arrives as a prop so `components/` stays
 * free of data-layer imports.
 *
 * No optimistic total is shown here. A count may be optimistic; anything the
 * customer could read as the amount payable comes from the server.
 */
export function AddToCart({
  variantId,
  inStock,
  action,
}: {
  variantId: string;
  inStock: boolean;
  action: CartAction;
}) {
  /**
   * Stable for the lifetime of this button, which is exactly the property the
   * idempotency key needs: a double-click sends the same seed, so the first
   * add cannot create two carts. A fresh random value per click would be the
   * anti-pattern the key exists to prevent.
   */
  const seed = useId();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<CartFeedback | null>(null);

  function add() {
    startTransition(async () => {
      setFeedback(null);
      setFeedback(await action({ variantId, quantity: 1, seed }));
    });
  }

  return (
    <div className="mt-6">
      <Button
        onClick={add}
        disabled={!inStock || pending}
        className="w-full"
        // Keeps the label from changing width mid-interaction, which would
        // shift the layout underneath the cursor.
        aria-busy={pending}
      >
        {!inStock ? "Out of stock" : pending ? "Adding…" : "Add to basket"}
      </Button>

      {feedback && (
        <p
          role="status"
          className={
            feedback.status === "ok"
              ? "text-muted-foreground mt-2 text-sm"
              : "text-destructive mt-2 text-sm"
          }
        >
          {feedback.status === "ok" && "Added to your basket."}
          {feedback.status === "out_of_stock" &&
            (feedback.available > 0
              ? `Only ${feedback.available} left.`
              : "This item just sold out.")}
          {/* The customer must see and accept a new price, never be charged it silently. */}
          {feedback.status === "price_changed" &&
            `The price changed to ${formatMoney(feedback.newPrice)}. Refresh to continue.`}
          {feedback.status === "cart_expired" &&
            "Your basket expired. Try adding the item again."}
          {feedback.status === "error" &&
            (feedback.retryable
              ? "Something went wrong. Try again."
              : "We could not add this item.")}
        </p>
      )}
    </div>
  );
}
