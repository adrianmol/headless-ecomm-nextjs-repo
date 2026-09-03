"use client";

import { useState, useTransition } from "react";
import type { CartFeedback } from "@/lib/cart-feedback";

/**
 * A client leaf rather than a plain `<form action={...}>`.
 *
 * A form action must return void, which would mean discarding the result — the
 * removal could fail and the row would simply stay put with no explanation.
 * Handling it in a transition lets the failure be shown.
 */
export function RemoveLineButton({
  lineId,
  onRemove,
}: {
  lineId: string;
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
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-2 rounded text-xs underline underline-offset-4 disabled:opacity-50 focus-visible:ring-2 focus-visible:outline-none"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {failed && (
        <p role="status" className="text-destructive mt-1 text-xs">
          Could not remove. Try again.
        </p>
      )}
    </>
  );
}
