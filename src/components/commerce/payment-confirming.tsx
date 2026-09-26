"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, Loader2 } from "lucide-react";

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
        <span className="bg-stock-low-surface text-stock-low mx-auto flex size-14 items-center justify-center rounded-full">
          <Clock aria-hidden className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">Inca verificam plata</h1>
        <p className="text-muted-foreground mt-3">
          Dureaza mai mult decat de obicei. Plata poate sa fi fost deja
          procesata, asa ca te rugam sa nu platesti din nou.
        </p>
        <p className="text-muted-foreground mt-3 text-sm">
          Daca ne contactezi, mentioneaza referinta{" "}
          <span className="text-foreground font-mono font-semibold">
            {orderRef}
          </span>
          .
        </p>
        <Link
          href="/modele"
          className="focus-visible:ring-ring mt-6 inline-block rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Continua cumparaturile
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center" role="status" aria-live="polite">
      <Loader2
        aria-hidden
        className="text-primary mx-auto size-10 animate-spin"
      />
      <h1 className="mt-5 text-2xl font-semibold">Confirmam plata</h1>
      <p className="text-muted-foreground mt-3">
        De obicei dureaza cateva secunde. Te rugam sa nu inchizi pagina si sa nu
        platesti din nou.
      </p>
    </div>
  );
}
