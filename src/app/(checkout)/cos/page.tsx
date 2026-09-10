import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  removeLineAction,
  setLineQuantityAction,
} from "@/commerce/cart/actions";
import { getCart } from "@/commerce/cart/queries";
import { getCartId } from "@/commerce/session";
import { CartTotals } from "@/components/commerce/cart-totals";
import { QuantityStepper } from "@/components/commerce/quantity-stepper";
import { RemoveLineButton } from "@/components/commerce/remove-line-button";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "Cosul meu",
  // A basket is per-visitor and must never be indexed or cached.
  robots: { index: false, follow: false },
};

function EmptyBasket() {
  return (
    <div className="py-16 text-center">
      <p className="text-muted-foreground">Cosul tau este gol.</p>
      <Link
        href="/produse"
        className="mt-4 inline-block underline underline-offset-4"
      >
        Vezi produsele
      </Link>
    </div>
  );
}

/**
 * Reads the cart cookie, so this is runtime data and lives behind Suspense.
 * Nothing here is cached — cart is per-visitor and decides what is charged.
 */
async function CartContents() {
  const cartId = await getCartId();
  if (!cartId) return <EmptyBasket />;

  const cart = await getCart(cartId);
  if (cart.lines.length === 0) return <EmptyBasket />;

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_20rem]">
      <ul className="divide-border divide-y">
        {cart.lines.map((line) => (
          <li
            key={line.id}
            className="flex items-start justify-between gap-4 py-4"
          >
            <div>
              <p className="font-medium">{line.title}</p>
              <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                {formatMoney(line.unitPrice)} / bucata
              </p>
              <div className="mt-3">
                <QuantityStepper
                  lineId={line.id}
                  quantity={line.quantity}
                  onChange={setLineQuantityAction}
                />
              </div>
            </div>

            <div className="text-right">
              {/* Server-rendered: the line total is money, never optimistic. */}
              <p className="font-medium tabular-nums">
                {formatMoney(line.lineTotal)}
              </p>
              <RemoveLineButton lineId={line.id} onRemove={removeLineAction} />
            </div>
          </li>
        ))}
      </ul>

      <aside className="h-fit rounded-lg border p-5">
        <h2 className="text-sm font-medium">Sumar comanda</h2>
        <div className="mt-4">
          <CartTotals totals={cart.totals} />
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Transportul si TVA se calculeaza la finalizarea comenzii.
        </p>
        <Button className="mt-5 w-full" asChild>
          <Link href="/finalizare-comanda">Finalizeaza comanda</Link>
        </Button>
      </aside>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid gap-10 md:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="bg-muted h-28 animate-pulse rounded-lg" />
        ))}
      </div>
      <div className="bg-muted h-48 animate-pulse rounded-lg" />
    </div>
  );
}

export default function CartPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">Cosul meu</h1>
      <Suspense fallback={<CartSkeleton />}>
        <CartContents />
      </Suspense>
    </main>
  );
}
