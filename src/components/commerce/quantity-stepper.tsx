"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import type { CartFeedback, QuantityAction } from "@/lib/cart-feedback";

const DEBOUNCE_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Client leaf. Receives the Server Action as a prop rather than importing it,
 * so `components/` keeps its zero-knowledge of the data layer.
 *
 * Two behaviours that are easy to get wrong:
 *
 * 1. Debounce and coalesce. A held "+" otherwise fires a request per click and
 *    the responses race, leaving the server on whichever one happened to land
 *    last. Only the final click issues a write, and it sends an absolute
 *    quantity, never a delta.
 *
 * 2. The optimistic value has to survive the debounce window. `useOptimistic`
 *    only holds while a transition is pending, so the wait happens *inside* the
 *    transition. Sleeping outside it would make the number snap back before the
 *    request was even sent.
 */
export function QuantityStepper({
  lineId,
  quantity,
  max,
  onChange,
}: {
  lineId: string;
  quantity: number;
  max?: number;
  onChange: QuantityAction;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    quantity,
    (_current, next: number) => next,
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<CartFeedback | null>(null);

  // The quantity the user has stepped to, which runs ahead of the server.
  const target = useRef(quantity);
  // Identifies the most recent intent; older ones bail out instead of writing.
  const latest = useRef(0);

  function step(delta: number) {
    // Clamp the *stepped* value. An earlier version returned Infinity when no
    // max was supplied, which JSON-serialises to null, which the backend read
    // as quantity 0 — so pressing "+" deleted the line.
    const stepped = target.current + delta;
    const next = Math.max(
      0,
      max === undefined ? stepped : Math.min(max, stepped),
    );
    if (next === target.current) return;

    target.current = next;
    latest.current += 1;
    const intent = latest.current;

    startTransition(async () => {
      setOptimistic(next);
      setFeedback(null);

      await sleep(DEBOUNCE_MS);
      if (intent !== latest.current) return; // superseded by a later click

      const result = await onChange({ lineId, quantity: target.current });
      if (result.status !== "ok") {
        // The server disagreed. Reconcile to its answer rather than silently
        // reverting: a number that jumps back with no explanation is worse
        // than no optimistic update at all.
        if (result.status === "out_of_stock") target.current = result.available;
        setFeedback(result);
      }
    });
  }

  const atMax = max !== undefined && optimistic >= max;

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={optimistic <= 0}
          aria-label="Scade cantitatea"
          className="border-input hover:bg-accent focus-visible:ring-ring size-8 rounded-md border disabled:opacity-40 focus-visible:ring-2 focus-visible:outline-none"
        >
          −
        </button>

        {/* Announced politely: the value changes without the user moving focus. */}
        <output
          aria-live="polite"
          aria-label="Cantitate"
          className="w-10 text-center text-sm tabular-nums"
        >
          {optimistic}
        </output>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={atMax}
          aria-label="Creste cantitatea"
          className="border-input hover:bg-accent focus-visible:ring-ring size-8 rounded-md border disabled:opacity-40 focus-visible:ring-2 focus-visible:outline-none"
        >
          +
        </button>

        <span
          className="text-muted-foreground ml-1 text-xs"
          aria-hidden={!pending}
        >
          {pending ? "Se salveaza…" : ""}
        </span>
      </div>

      {feedback && feedback.status !== "ok" && (
        <p role="status" className="text-destructive mt-1 text-xs">
          {feedback.status === "out_of_stock" &&
            `Au mai ramas doar ${feedback.available} bucati — am ajustat cantitatea.`}
          {feedback.status === "cart_expired" &&
            "Cosul a expirat. Reincarca pagina pentru a incepe din nou."}
          {feedback.status === "price_changed" &&
            "Pretul s-a schimbat. Reincarca pagina pentru noul total."}
          {feedback.status === "error" &&
            (feedback.retryable
              ? "A aparut o eroare. Incearca din nou."
              : "Nu am putut actualiza cosul.")}
        </p>
      )}
    </div>
  );
}
