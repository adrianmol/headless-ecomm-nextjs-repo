"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { CartFeedback } from "@/lib/cart-feedback";

/**
 * A client leaf rather than a plain `<form action={...}>`.
 *
 * A form action must return void, which would mean discarding the result — the
 * removal could fail and the row would simply stay put with no explanation.
 * Handling it in a transition lets the failure be shown.
 *
 * `productName` goes into the accessible name, so a screen reader's button
 * list reads "Sterge Toner X" rather than a column of identical "Sterge"
 * entries. An aria-label that starts with the visible word, not hidden text,
 * which would put the product name on the page twice.
 */
export function RemoveLineButton({
  lineId,
  productName,
  onRemove,
}: {
  lineId: string;
  productName?: string;
  onRemove: (input: { lineId: string }) => Promise<CartFeedback>;
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function remove() {
    startTransition(async () => {
      setFailed(false);
      const result = await onRemove({ lineId });
      if (result.status !== "ok") setFailed(true);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-busy={pending}
        aria-label={productName ? `Sterge ${productName}` : undefined}
        className="text-muted-foreground hover:text-destructive focus-visible:ring-ring -mx-1.5 inline-flex h-9 items-center gap-1.5 rounded-md px-1.5 text-xs disabled:opacity-50 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Trash2 aria-hidden className="size-4" />
        {pending ? "Se sterge…" : "Sterge"}
      </button>
      {failed && (
        <p role="status" className="text-destructive mt-1 text-xs">
          Nu am putut sterge produsul. Incearca din nou.
        </p>
      )}
    </>
  );
}
