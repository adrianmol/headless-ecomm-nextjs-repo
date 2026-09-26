"use client";

import { useId, useState, useTransition } from "react";
import { defaultButtonClasses } from "@/lib/button-variants";
import { announceCartAdded } from "@/lib/cart-events";
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
  /**
   * Wrapper spacing. Defaults to the PDP's, because that was the only caller
   * when this was written; a listing card supplies its own, since `mt-6` inside
   * a card doubles up with the card's own padding.
   *
   * A plain replacement rather than a merge: `cn` would pull tailwind-merge into
   * this client leaf and undo part of the 10.4 kB it was rewritten to save.
   */
  wrapperClassName = "mt-6",
  productName,
  imageUrl,
}: {
  variantId: string;
  inStock: boolean;
  action: CartAction;
  wrapperClassName?: string;
  /** For the confirmation toast only; never sent to the action. */
  productName?: string;
  imageUrl?: string | null;
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
      const result = await action({ variantId, quantity: 1, seed });
      // Success is announced by the site-wide toast (cart-toast.tsx), which
      // also offers the next step; only problems stay beside the button.
      if (result.status === "ok")
        announceCartAdded({ name: productName, imageUrl });
      else setFeedback(result);
    });
  }

  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        onClick={add}
        disabled={!inStock || pending}
        // Plain template string, NOT `cn()`, deliberately. `cn` pulls
        // `tailwind-merge` and `clsx`, and this is a client leaf on the PDP —
        // importing it here would put tailwind-merge back into the PDP bundle
        // and undo part of the 10.4 kB this component was rewritten to save.
        // Safe as concatenation because `w-full` conflicts with nothing in
        // `defaultButtonClasses`; if a `w-*` is ever added there, fix it there
        // rather than reaching for a merger.
        className={`${defaultButtonClasses} w-full`}
        // Keeps the label from changing width mid-interaction, which would
        // shift the layout underneath the cursor.
        aria-busy={pending}
      >
        {!inStock ? "Stoc epuizat" : pending ? "Se adauga…" : "Adauga in cos"}
      </button>

      {feedback && feedback.status !== "ok" && (
        <p role="status" className="text-destructive mt-2 text-sm">
          {feedback.status === "out_of_stock" &&
            (feedback.available > 0
              ? `Au mai ramas doar ${feedback.available} bucati.`
              : "Produsul tocmai s-a epuizat.")}
          {/* The customer must see and accept a new price, never be charged it silently. */}
          {feedback.status === "price_changed" &&
            `Pretul s-a schimbat la ${formatMoney(feedback.newPrice)}. Reincarca pagina pentru a continua.`}
          {feedback.status === "cart_expired" &&
            "Cosul a expirat. Incearca sa adaugi produsul din nou."}
          {feedback.status === "error" &&
            (feedback.retryable
              ? "A aparut o eroare. Incearca din nou."
              : "Nu am putut adauga acest produs.")}
        </p>
      )}
    </div>
  );
}
