import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  removeHubLineAction,
  setHubLineQuantityAction,
} from "@/commerce/session-cart/actions";
import { priceCart, readCartLines } from "@/commerce/session-cart/cart";
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
        href="/modele"
        className="mt-4 inline-block underline underline-offset-4"
      >
        Vezi produsele
      </Link>
    </div>
  );
}

const productHref = (sku: string) => `/produse-hub/${encodeURIComponent(sku)}`;

/**
 * Reads the session cart cookie, so this is runtime data and lives behind
 * Suspense. Prices come from HUB's live endpoint on every render, never from
 * the cookie — see src/commerce/session-cart/cart.ts.
 */
async function CartContents() {
  const stored = await readCartLines();
  if (stored.length === 0) return <EmptyBasket />;

  const cart = await priceCart(stored);

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_20rem]">
      <div>
        <ul className="divide-border divide-y">
          {cart.lines.map((line) => (
            <li
              key={line.sku}
              className="flex items-start justify-between gap-4 py-4"
            >
              <div>
                <Link href={productHref(line.sku)} className="font-medium">
                  {line.name}
                </Link>
                <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                  {formatMoney(line.unitPrice)} / bucata
                </p>
                <div className="mt-3">
                  <QuantityStepper
                    lineId={line.sku}
                    quantity={line.quantity}
                    max={line.maxQuantity}
                    onChange={setHubLineQuantityAction}
                  />
                </div>
              </div>

              <div className="text-right">
                {/* Server-rendered: the line total is money, never optimistic. */}
                <p className="font-medium tabular-nums">
                  {formatMoney(line.lineTotal)}
                </p>
                <RemoveLineButton
                  lineId={line.sku}
                  onRemove={removeHubLineAction}
                />
              </div>
            </li>
          ))}
        </ul>

        {cart.unavailable.length > 0 && (
          <section className="border-border mt-6 rounded-lg border p-4">
            <h2 className="text-destructive text-sm font-medium">
              Indisponibile momentan
            </h2>
            <ul className="mt-2 space-y-2">
              {cart.unavailable.map((line) => (
                <li
                  key={line.sku}
                  className="flex items-start justify-between gap-4 text-sm"
                >
                  <Link
                    href={productHref(line.sku)}
                    className="text-muted-foreground"
                  >
                    {line.name}
                  </Link>
                  <RemoveLineButton
                    lineId={line.sku}
                    onRemove={removeHubLineAction}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="h-fit rounded-lg border p-5">
        <h2 className="text-sm font-medium">Sumar comanda</h2>
        {cart.total ? (
          <>
            <div className="mt-4">
              <CartTotals
                totals={{ subtotal: cart.total, total: cart.total }}
              />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Transportul se calculeaza la finalizarea comenzii.
            </p>
            <Button className="mt-5 w-full" asChild>
              <Link href="/finalizare-comanda">Finalizeaza comanda</Link>
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            Niciun produs din cos nu poate fi comandat acum.
          </p>
        )}
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
