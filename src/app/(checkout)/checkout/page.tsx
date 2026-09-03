import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getCart } from "@/commerce/cart/queries";
import { startCheckoutAction } from "@/commerce/checkout/actions";
import { getCartId } from "@/commerce/session";
import { CheckoutForm } from "@/components/commerce/checkout-form";
import { Price } from "@/components/commerce/price";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

async function CheckoutSummary() {
  const cartId = await getCartId();
  const cart = cartId ? await getCart(cartId) : null;

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          Your basket is empty, so there is nothing to check out.
        </p>
        <Link
          href="/products"
          className="mt-4 inline-block underline underline-offset-4"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_20rem]">
      <section>
        <h2 className="mb-4 text-sm font-medium">Delivery details</h2>
        <CheckoutForm action={startCheckoutAction} />
      </section>

      <aside className="h-fit rounded-lg border p-5">
        <h2 className="text-sm font-medium">Order summary</h2>
        <ul className="mt-4 space-y-2">
          {cart.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {line.title} × {line.quantity}
              </span>
              <span className="tabular-nums">
                {formatMoney(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t pt-4">
          <span className="text-muted-foreground text-sm">Total</span>
          {/* Server-rendered from the cart the backend just returned. */}
          <Price price={cart.totals.total} />
        </div>
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
  searchParams: PageProps<"/checkout">["searchParams"];
}) {
  const { error } = await searchParams;
  if (error !== "payment_failed") return null;

  return (
    <p role="alert" className="text-destructive mb-6 text-sm">
      Your payment was not completed. Nothing has been charged — you can try
      again below.
    </p>
  );
}

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">Checkout</h1>

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
