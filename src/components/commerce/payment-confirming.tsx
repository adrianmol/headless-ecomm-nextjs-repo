"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Status = "pending" | "paid" | "failed" | "cancelled" | "unknown";

/**
 * Shown while the PSP webhook is still in flight.
 *
 * The point of this screen is that it asserts nothing. Telling somebody their
 * payment failed when it is merely unconfirmed produces duplicate payments;
 * telling them it succeeded when it has not produces unpaid orders. So it
 * polls, and if it never resolves it hands off to support rather than
 * inventing an outcome.
 *
 * Backs off so a slow webhook does not turn every waiting customer into a
 * request loop against the order endpoint.
 */
export function PaymentConfirming({
  orderRef,
  poll,
}: {
  orderRef: string;
  poll: (ref: string) => Promise<Status>;
}) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    (async () => {
      // ~60s total: 1s, 1.5s, 2.25s … capped at 8s.
      let delay = 1000;
      const deadline = Date.now() + 60_000;

      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, delay));
        if (cancelled.current) return;

        const status = await poll(orderRef);
        if (cancelled.current) return;

        if (status === "paid") {
          router.replace(`/comenzi/${encodeURIComponent(orderRef)}`);
          return;
        }
        if (status === "failed" || status === "cancelled") {
          router.replace("/finalizare-comanda?error=payment_failed");
          return;
        }
        delay = Math.min(delay * 1.5, 8000);
      }

      if (!cancelled.current) setTimedOut(true);
    })();

    return () => {
      cancelled.current = true;
    };
  }, [orderRef, poll, router]);

  if (timedOut) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold">
          Still confirming your payment
        </h1>
        <p className="text-muted-foreground mt-3">
          This is taking longer than usual. Your payment may still have gone
          through, so please do not pay again.
        </p>
        <p className="text-muted-foreground mt-3 text-sm">
          Quote reference <span className="font-mono">{orderRef}</span> when you
          contact us.
        </p>
        <Link
          href="/products"
          className="mt-6 inline-block underline underline-offset-4"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center" role="status" aria-live="polite">
      <h1 className="text-2xl font-semibold">Confirmam plata</h1>
      <p className="text-muted-foreground mt-3">
        This usually takes a few seconds. Please do not close this page or pay
        again.
      </p>
      <div
        className="bg-muted mx-auto mt-8 h-1 w-40 overflow-hidden rounded"
        aria-hidden
      >
        <div className="bg-foreground/40 h-full w-1/3 animate-pulse" />
      </div>
    </div>
  );
}
