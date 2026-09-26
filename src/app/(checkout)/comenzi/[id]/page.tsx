import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { readLastOrder } from "@/commerce/session-cart/cart";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  // An order confirmation must never be indexed, and must never be cached.
  robots: { index: false, follow: false, nocache: true },
};

type ParamsPromise = PageProps<"/comenzi/[id]">["params"];

/**
 * Reads the order from this visitor's session cookie, so another customer's
 * order id in the URL shows nothing — the id only selects within one's own
 * session. When a real order backend lands, this goes back to `getOrder`.
 */
async function OrderDetail({ params }: { params: ParamsPromise }) {
  const { id } = await params;
  const order = await readLastOrder();

  if (!order || order.id !== id) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Comanda nu a fost gasita</h1>
        <p className="text-muted-foreground mt-3">
          Comenzile pot fi vazute doar din browserul in care au fost plasate.
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
    <div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Multumim — am primit comanda</h1>
        <p className="text-muted-foreground mt-3">
          Numar comanda <span className="font-mono">{order.id}</span>
        </p>
        <p className="mt-3">
          Te sunam la {order.phone} pentru confirmare. Nu ai platit nimic inca.
        </p>
      </div>

      <ul className="border-border mt-8 space-y-2 border-t pt-4">
        {order.lines.map((line) => (
          <li key={line.sku} className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">
              {line.name} × {line.quantity}
            </span>
            <span className="tabular-nums">{formatMoney(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <p className="border-border mt-4 flex justify-between border-t pt-4 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatMoney(order.total)}</span>
      </p>

      <p className="text-muted-foreground mt-6 text-sm">
        Livrare catre {order.name}, {order.address} · {order.email}
      </p>

      <Link
        href="/modele"
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
