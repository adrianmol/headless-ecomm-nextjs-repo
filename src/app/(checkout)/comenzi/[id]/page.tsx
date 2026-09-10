import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getOrder } from "@/commerce/checkout/queries";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  // An order confirmation must never be indexed, and must never be cached.
  robots: { index: false, follow: false, nocache: true },
};

type ParamsPromise = PageProps<"/comenzi/[id]">["params"];

/**
 * Reads order state from the backend, never from URL parameters or client
 * state. Re-loading or accidentally sharing this link is safe: the read is
 * authorised against the session by the backend.
 */
async function OrderDetail({ params }: { params: ParamsPromise }) {
  const { id } = await params;
  const order = await getOrder(id);

  if (order.status !== "paid") {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Plata nu a fost finalizata</h1>
        <p className="text-muted-foreground mt-3">
          Aceasta comanda nu a fost platita.
        </p>
        <Link
          href="/cos"
          className="mt-6 inline-block underline underline-offset-4"
        >
          Inapoi la cos
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold">
        Multumim — comanda ta este confirmata
      </h1>
      <p className="text-muted-foreground mt-3">
        Numar comanda <span className="font-mono">{order.id}</span>
      </p>
      <p className="mt-6 text-lg font-medium tabular-nums">
        {formatMoney(order.total)}
      </p>
      <Link
        href="/produse"
        className="mt-8 inline-block underline underline-offset-4"
      >
        Continua cumparaturile
      </Link>
    </div>
  );
}

export default function OrderPage({ params }: PageProps<"/comenzi/[id]">) {
  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <Suspense
        fallback={<div className="bg-muted h-40 animate-pulse rounded-lg" />}
      >
        <OrderDetail params={params} />
      </Suspense>
    </main>
  );
}
