import { ViewTransition } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  PhoneCall,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import {
  removeHubLineAction,
  setHubLineQuantityAction,
} from "@/commerce/session-cart/actions";
import {
  lineCatalog,
  priceCart,
  readCartLines,
} from "@/commerce/session-cart/cart";
import { CartTotals } from "@/components/commerce/cart-totals";
import { CheckoutSteps } from "@/components/commerce/checkout-steps";
import { LineThumbnail } from "@/components/commerce/line-thumbnail";
import { QuantityStepper } from "@/components/commerce/quantity-stepper";
import { RemoveLineButton } from "@/components/commerce/remove-line-button";
import { WhatsAppLink } from "@/components/commerce/whatsapp-link";
import { whatsappNumber } from "@/lib/env";
import { cartQuestion, whatsappHref } from "@/lib/whatsapp";
import { LOW_STOCK_THRESHOLD } from "@/components/commerce/stock-badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Cosul meu",
  // A basket is per-visitor and must never be indexed or cached.
  robots: { index: false, follow: false },
};

/*
  Checkout waits for a quantity change to land. Leaving mid-save would render
  checkout from the cookie before the write, i.e. with the old quantity.
*/
const PAUSE_WHILE_SAVING =
  "group-has-data-pending/cart:pointer-events-none group-has-data-pending/cart:opacity-60";

/**
 * A `view-transition-name` must be a CSS identifier and unique on the page;
 * a sku may contain anything. Collisions after replacement would only merge
 * two lines' animations, never their data.
 */
const lineTransitionName = (sku: string) =>
  `cart-line-${sku.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

const productHref = (sku: string) => `/produse-hub/${encodeURIComponent(sku)}`;

/** Romanian plural: 1 produs, 2–19 produse, 20+ de produse. */
function itemCountLabel(count: number) {
  if (count === 1) return "1 produs";
  const rest = count % 100;
  return rest === 0 || rest >= 20 ? `${count} de produse` : `${count} produse`;
}

/*
  A default-size Button on purpose: e2e/button-equivalence.spec.ts measures
  AddToCart against it, and it is the only default Button left on the site.
*/
function EmptyBasket() {
  return (
    <div className="border-border flex flex-col items-center rounded-xl border px-4 py-16 text-center">
      <span className="bg-muted flex size-14 items-center justify-center rounded-full">
        <ShoppingCart aria-hidden className="text-muted-foreground size-6" />
      </span>
      <p className="mt-5 text-lg font-semibold">Cosul tau este gol.</p>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Gaseste cartusul sau tonerul potrivit pornind de la modelul imprimantei
        tale.
      </p>
      <Button className="mt-6" asChild>
        <Link href="/modele">Cauta dupa model</Link>
      </Button>
    </div>
  );
}

/**
 * Reads the session cart cookie, so this is runtime data and lives behind
 * Suspense. Prices come from HUB's live endpoint on every render, never from
 * the cookie — see src/commerce/session-cart/cart.ts. Every figure below is
 * server-rendered; the stepper's optimistic number is the only client value,
 * and it is a quantity, not money.
 */
async function CartContents() {
  const stored = await readCartLines();
  if (stored.length === 0) return <EmptyBasket />;

  const [cart, catalog] = await Promise.all([
    priceCart(stored),
    lineCatalog(stored.map((line) => line.sku)),
  ]);
  const itemCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const whatsapp = whatsappNumber();

  return (
    // Bottom padding clears the fixed mobile checkout bar. `group/cart` lets
    // every total below fade while any stepper is saving: the server figures
    // are momentarily stale, and saying so beats showing the old number as if
    // it were current.
    <div className="group/cart grid gap-8 pb-24 lg:grid-cols-[1fr_22rem] lg:items-start lg:pb-0">
      <div className="space-y-6">
        {cart.lines.length > 0 && (
          <section
            aria-label="Produse in cos"
            className="border-border bg-card rounded-xl border px-4 sm:px-5"
          >
            <ul className="divide-border divide-y">
              {cart.lines.map((line) => (
                // Named per line so a removal animates: the removed line fades
                // out and the ones below slide up, instead of the list jumping.
                <ViewTransition
                  key={line.sku}
                  name={lineTransitionName(line.sku)}
                  exit="line-out"
                  update="line-move"
                  default="none"
                >
                  <li className="group/line flex gap-4 py-5">
                    {/* Duplicate of the name link, so hidden from AT and tab order. */}
                    <Link
                      href={productHref(line.sku)}
                      tabIndex={-1}
                      aria-hidden
                    >
                      <LineThumbnail
                        imageUrl={catalog.get(line.sku)?.imageUrl}
                      />
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link
                            href={productHref(line.sku)}
                            className="focus-visible:ring-ring line-clamp-2 rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {line.name}
                          </Link>
                          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                            Cod: {line.sku}
                          </p>
                        </div>
                        {/* Server-rendered: the line total is money, never optimistic. */}
                        <p className="shrink-0 font-semibold tabular-nums transition-opacity group-has-data-pending/line:opacity-40">
                          {formatMoney(line.lineTotal)}
                        </p>
                      </div>

                      <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                        {formatMoney(line.unitPrice)} / buc.
                      </p>

                      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <QuantityStepper
                          lineId={line.sku}
                          quantity={line.quantity}
                          max={line.maxQuantity}
                          onChange={setHubLineQuantityAction}
                        />
                        <RemoveLineButton
                          lineId={line.sku}
                          productName={line.name}
                          onRemove={removeHubLineAction}
                        />
                      </div>

                      {line.maxQuantity <= LOW_STOCK_THRESHOLD && (
                        <p className="text-stock-low mt-2 text-xs font-medium">
                          {line.maxQuantity === 1
                            ? "Ultima bucata in stoc"
                            : `Mai sunt doar ${line.maxQuantity} bucati in stoc`}
                        </p>
                      )}
                    </div>
                  </li>
                </ViewTransition>
              ))}
            </ul>
          </section>
        )}

        {cart.unavailable.length > 0 && (
          <section
            aria-labelledby="unavailable-heading"
            className="border-stock-low/40 bg-stock-low-surface/40 rounded-xl border p-4 sm:p-5"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                aria-hidden
                className="text-stock-low mt-0.5 size-4 shrink-0"
              />
              <div>
                <h2 id="unavailable-heading" className="text-sm font-semibold">
                  Indisponibile momentan
                </h2>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Nu pot fi comandate acum si nu sunt incluse in total.
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {cart.unavailable.map((line) => (
                <li key={line.sku} className="flex items-center gap-3 text-sm">
                  <LineThumbnail
                    imageUrl={catalog.get(line.sku)?.imageUrl}
                    size="sm"
                  />
                  <Link
                    href={productHref(line.sku)}
                    className="text-muted-foreground focus-visible:ring-ring line-clamp-2 min-w-0 flex-1 rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {line.name}
                  </Link>
                  <RemoveLineButton
                    lineId={line.sku}
                    productName={line.name}
                    onRemove={removeHubLineAction}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href="/modele"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Continua cumparaturile
        </Link>
      </div>

      <aside
        aria-labelledby="summary-heading"
        className="border-border bg-card rounded-xl border p-5 lg:sticky lg:top-44"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="summary-heading" className="font-semibold">
            Sumar comanda
          </h2>
          {itemCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {itemCountLabel(itemCount)}
            </p>
          )}
        </div>

        {cart.total ? (
          <>
            <div className="mt-4 transition-opacity group-has-data-pending/cart:opacity-40">
              <CartTotals
                totals={{ subtotal: cart.total, total: cart.total }}
              />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Costul livrarii ti-l comunicam la confirmarea telefonica a
              comenzii.
            </p>
            <Button
              size="xl"
              className={cn("mt-5 w-full", PAUSE_WHILE_SAVING)}
              asChild
            >
              <Link href="/finalizare-comanda">
                Finalizeaza comanda
                <ArrowRight aria-hidden />
              </Link>
            </Button>

            <ul className="text-muted-foreground border-border mt-5 space-y-2.5 border-t pt-5 text-xs">
              <li className="flex items-start gap-2">
                <Wallet aria-hidden className="mt-px size-4 shrink-0" />
                Nu platesti nimic online.
              </li>
              <li className="flex items-start gap-2">
                <PhoneCall aria-hidden className="mt-px size-4 shrink-0" />
                Te sunam pentru confirmare inainte de livrare.
              </li>
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            Niciun produs din cos nu poate fi comandat acum.
          </p>
        )}

        {/*
          Once in the cart, as the plan specifies, and outside the branch above:
          a cart nothing can be ordered from is when a question is likeliest.
          Every line is named, orderable or not, so whoever answers sees the
          same cart.
        */}
        {whatsapp && (
          <WhatsAppLink
            className="mt-4"
            href={whatsappHref(whatsapp, cartQuestion(stored))}
          />
        )}
      </aside>

      {/*
        The CTA stays in reach on phones, where the summary sits below a long
        list. Server-rendered from the same live total as the summary, and
        hidden (display: none) from lg up, where the summary is sticky instead.
      */}
      {cart.total && (
        <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-10 border-t px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-page items-center justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="text-lg font-semibold tabular-nums transition-opacity group-has-data-pending/cart:opacity-40">
                {formatMoney(cart.total)}
              </p>
            </div>
            <Button size="xl" className={PAUSE_WHILE_SAVING} asChild>
              <Link href="/finalizare-comanda">
                Finalizeaza comanda
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mirrors one loaded line's structure so the swap costs no layout shift. */
function LineSkeleton() {
  return (
    <div className="flex gap-4 py-5">
      <div className="bg-muted size-20 shrink-0 animate-pulse rounded-md" />
      <div className="flex-1 space-y-1">
        <div className="bg-muted h-6 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-24 animate-pulse rounded" />
        <div className="bg-muted h-5 w-28 animate-pulse rounded" />
        <div className="bg-muted mt-3 h-10 w-32 animate-pulse rounded-lg" />
      </div>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="border-border divide-border divide-y rounded-xl border px-4 sm:px-5">
        <LineSkeleton />
        <LineSkeleton />
      </div>
      <div className="bg-muted h-80 animate-pulse rounded-xl" />
      <span className="sr-only">Se incarca cosul</span>
    </div>
  );
}

export default function CartPage() {
  return (
    <main className="max-w-page mx-auto px-4 py-8 sm:py-10">
      <CheckoutSteps current={0} />
      <h1 className="mb-6 text-2xl font-semibold sm:text-3xl">Cosul meu</h1>
      <Reveal fallback={<CartSkeleton />}>
        <CartContents />
      </Reveal>
    </main>
  );
}
