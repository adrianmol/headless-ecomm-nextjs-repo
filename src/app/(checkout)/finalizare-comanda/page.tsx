import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ShoppingBag } from "lucide-react";
import { placeSessionOrderAction } from "@/commerce/session-cart/actions";
import {
  lineImages,
  priceCart,
  readCartLines,
} from "@/commerce/session-cart/cart";
import { CheckoutForm } from "@/components/commerce/checkout-form";
import { CartTotals } from "@/components/commerce/cart-totals";
import { CheckoutSteps } from "@/components/commerce/checkout-steps";
import { OrderLines } from "@/components/commerce/order-lines";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "Finalizare comanda",
  robots: { index: false, follow: false },
};

async function CheckoutSummary() {
  const stored = await readCartLines();
  const [cart, images] = await Promise.all([
    priceCart(stored),
    lineImages(stored.map((line) => line.sku)),
  ]);

  if (!cart.total) {
    return (
      <div className="border-border flex flex-col items-center rounded-xl border px-4 py-16 text-center">
        <p className="text-muted-foreground">
          Cosul tau este gol, asa ca nu ai ce comanda.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/modele">Vezi produsele</Link>
        </Button>
      </div>
    );
  }

  const lines = cart.lines.map((line) => ({
    ...line,
    imageUrl: images.get(line.sku),
  }));

  // Rendered twice below — a collapsible panel on phones, a sticky column from
  // lg up — with the other copy display:none, so it is read out once.
  const summary = (
    <>
      <OrderLines lines={lines} />
      {/* Server-rendered from live HUB prices, never from the cookie. */}
      <div className="border-border mt-5 border-t pt-5">
        <CartTotals totals={{ subtotal: cart.total, total: cart.total }} />
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        Costul livrarii ti-l comunicam la confirmarea telefonica a comenzii.
      </p>
      {cart.unavailable.length > 0 && (
        <p className="text-destructive mt-4 flex items-start gap-2 text-xs">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            Unele produse din cos nu mai sunt disponibile.{" "}
            <Link href="/cos" className="underline underline-offset-4">
              Verifica cosul
            </Link>
          </span>
        </p>
      )}
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-10">
      <details className="group border-border bg-card rounded-xl border lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShoppingBag aria-hidden className="size-4" />
            <span className="group-open:hidden">Arata sumarul comenzii</span>
            <span className="hidden group-open:inline">
              Ascunde sumarul comenzii
            </span>
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform group-open:rotate-180"
            />
          </span>
          <span className="font-semibold tabular-nums">
            {formatMoney(cart.total)}
          </span>
        </summary>
        <div className="border-border border-t p-4">{summary}</div>
      </details>

      <section aria-label="Date de livrare">
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

      <aside
        aria-labelledby="summary-heading"
        className="border-border bg-card hidden rounded-xl border p-6 lg:sticky lg:top-44 lg:block"
      >
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="summary-heading" className="font-semibold">
            Sumar comanda
          </h2>
          <Link
            href="/cos"
            className="text-primary focus-visible:ring-ring rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Modifica cosul
          </Link>
        </div>
        {summary}
      </aside>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-10">
      <div className="bg-muted h-14 animate-pulse rounded-xl lg:hidden" />
      <div className="space-y-5">
        <div className="bg-muted h-48 animate-pulse rounded-xl" />
        <div className="bg-muted h-80 animate-pulse rounded-xl" />
        <div className="bg-muted h-12 animate-pulse rounded-lg" />
      </div>
      <div className="bg-muted hidden h-80 animate-pulse rounded-xl lg:block" />
      <span className="sr-only">Se incarca</span>
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
    <p
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive mb-6 rounded-lg border p-3 text-sm"
    >
      Plata nu a fost finalizata. Nu ti-a fost debitata nicio suma — poti
      incerca din nou mai jos.
    </p>
  );
}

export default function CheckoutPage({
  searchParams,
}: PageProps<"/finalizare-comanda">) {
  return (
    <main className="max-w-page mx-auto px-4 py-8 sm:py-10">
      <CheckoutSteps current={1} />
      <h1 className="mb-6 text-2xl font-semibold sm:text-3xl">
        Finalizare comanda
      </h1>

      <Suspense fallback={null}>
        <PaymentFailedNotice searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutSummary />
      </Suspense>
    </main>
  );
}
