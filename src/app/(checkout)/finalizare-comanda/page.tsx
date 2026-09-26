import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { placeSessionOrderAction } from "@/commerce/session-cart/actions";
import { priceCart, readCartLines } from "@/commerce/session-cart/cart";
import { CheckoutForm } from "@/components/commerce/checkout-form";
import { CartTotals } from "@/components/commerce/cart-totals";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "Finalizare comanda",
  robots: { index: false, follow: false },
};

async function CheckoutSummary() {
  const cart = await priceCart(await readCartLines());

  if (!cart.total) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          Cosul tau este gol, asa ca nu ai ce comanda.
        </p>
        <Link
          href="/modele"
          className="mt-4 inline-block underline underline-offset-4"
        >
          Vezi produsele
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_20rem]">
      <section>
        <h2 className="mb-4 text-sm font-medium">Date de livrare</h2>
        {/*
          The total shown here, so the action can refuse if it moved, and a key
          per page load so a double-submit sends one order, not two.
        */}
        <CheckoutForm
          action={placeSessionOrderAction}
          hidden={{
            expectedTotal: String(cart.total.amountMinor),
            orderKey: randomUUID(),
          }}
        />
      </section>

      <aside className="h-fit rounded-lg border p-5">
        <h2 className="text-sm font-medium">Sumar comanda</h2>
        <ul className="mt-4 space-y-2">
          {cart.lines.map((line) => (
            <li key={line.sku} className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {line.name} × {line.quantity}
              </span>
              <span className="tabular-nums">
                {formatMoney(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        {/* Server-rendered from live HUB prices, never from the cookie. */}
        <div className="border-border mt-4 border-t pt-4">
          <CartTotals totals={{ subtotal: cart.total, total: cart.total }} />
        </div>
        {cart.unavailable.length > 0 && (
          <p className="text-destructive mt-3 text-xs">
            Unele produse din cos nu mai sunt disponibile.{" "}
            <Link href="/cos" className="underline underline-offset-4">
              Verifica cosul
            </Link>
          </p>
        )}
      </aside>
    </div>
  );
}

/**
 * `searchParams` is runtime data. Awaiting it in the page body would put a
 * runtime access outside every Suspense boundary and stop the whole route
 * prerendering, so the promise is passed down and resolved in here instead.
 */
async function PaymentFailedNotice({
  searchParams,
}: {
  searchParams: PageProps<"/finalizare-comanda">["searchParams"];
}) {
  const { error } = await searchParams;
  if (error !== "payment_failed") return null;

  return (
    <p role="alert" className="text-destructive mb-6 text-sm">
      Plata nu a fost finalizata. Nu ti-a fost debitata nicio suma — poti
      incerca din nou mai jos.
    </p>
  );
}

export default function CheckoutPage({
  searchParams,
}: PageProps<"/finalizare-comanda">) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">Finalizare comanda</h1>

      <Suspense fallback={null}>
        <PaymentFailedNotice searchParams={searchParams} />
      </Suspense>

      <Suspense
        fallback={<div className="bg-muted h-96 animate-pulse rounded-lg" />}
      >
        <CheckoutSummary />
      </Suspense>
    </main>
  );
}
