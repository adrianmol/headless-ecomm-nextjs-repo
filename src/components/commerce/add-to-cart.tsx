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
  label = "Adauga in cos",
  withQuantity = false,
}: {
  variantId: string;
  inStock: boolean;
  action: CartAction;
  wrapperClassName?: string;
  /** For the confirmation toast only; never sent to the action. */
  productName?: string;
  imageUrl?: string | null;
  /** The plan's table rows say „Adaugă"; everywhere else keeps the default. */
  label?: string;
  /**
   * Shows a quantity field beside the button, for the product page. A native
   * number input rather than the cart's stepper: that one saves on every
   * press, and here nothing is saved until the button is.
   */
  withQuantity?: boolean;
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
  const [quantity, setQuantity] = useState(1);

  function add() {
    startTransition(async () => {
      setFeedback(null);
      const result = await action({ variantId, quantity, seed });
      // Success is announced by the site-wide toast (cart-toast.tsx), which
      // also offers the next step; only problems stay beside the button.
      if (result.status === "ok")
        announceCartAdded({ name: productName, imageUrl });
      else setFeedback(result);
    });
  }

  return (
    <div className={wrapperClassName}>
      <div className="flex gap-2">
        {withQuantity && (
          <input
            type="number"
            aria-label="Cantitate"
            min={1}
            max={99}
            value={quantity}
            disabled={!inStock || pending}
            // The server clamps and re-checks stock; this only keeps the
            // field from holding something that is not a quantity.
            onChange={(event) =>
              setQuantity(
                Math.min(99, Math.max(1, Math.trunc(+event.target.value) || 1)),
              )
            }
            className="border-input bg-background focus-visible:ring-ring h-8 w-16 shrink-0 rounded-lg border px-2 text-center text-sm tabular-nums focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          />
        )}
        <button
          type="button"
          onClick={add}
          disabled={!inStock || pending}
          // Plain template string, NOT `cn()`, deliberately. `cn` pulls
          // `tailwind-merge` and `clsx`, and this is a client leaf on the PDP —
          // importing it here would put tailwind-merge back into the PDP bundle
          // and undo part of the 10.4 kB this component was rewritten to save.
          // Safe as concatenation because `grow` conflicts with nothing in
          // `defaultButtonClasses`; if a `grow-*` is ever added there, fix it
          // there rather than reaching for a merger.
          //
          // `grow`, not `w-full`: the base classes carry `shrink-0`, so a full
          // width button beside the quantity field overflowed the row by the
          // field's width.
          className={`${defaultButtonClasses} grow`}
          // Keeps the label from changing width mid-interaction, which would
          // shift the layout underneath the cursor.
          aria-busy={pending}
        >
          {!inStock ? "Stoc epuizat" : pending ? "Se adauga…" : label}
        </button>
      </div>

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
