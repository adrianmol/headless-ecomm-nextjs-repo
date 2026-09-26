import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Mail,
  MapPin,
  PhoneCall,
  Truck,
} from "lucide-react";
import { lineCatalog, readLastOrder } from "@/commerce/session-cart/cart";
import { CheckoutSteps } from "@/components/commerce/checkout-steps";
import { OrderLines } from "@/components/commerce/order-lines";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { Reveal } from "@/components/reveal";

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

  const catalog = await lineCatalog(order.lines.map((line) => line.sku));
  const lines = order.lines.map((line) => ({
    ...line,
    // Stored in older cookies only; else the catalogue; else the code.
    name: line.name ?? catalog.get(line.sku)?.name ?? line.sku,
    imageUrl: catalog.get(line.sku)?.imageUrl,
  }));

  // Only what this flow actually does: the shop is emailed, then calls.
  const nextSteps = [
    {
      icon: CheckCircle2,
      title: "Am primit comanda",
      body: "A ajuns la noi si o pregatim.",
    },
    {
      icon: PhoneCall,
      title: "Te sunam pentru confirmare",
      body: `La ${order.phone}, ca sa confirmam produsele si livrarea.`,
    },
    {
      icon: Truck,
      title: "Livram comanda",
      body: "Dupa confirmarea telefonica.",
    },
  ];

  return (
    <div>
      {/* Only here, not on the not-found state: that is no step of anything. */}
      <CheckoutSteps current={2} />
      <div className="text-center">
        <span className="bg-accent text-accent-foreground mx-auto flex size-14 items-center justify-center rounded-full">
          <CheckCircle2 aria-hidden className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold sm:text-3xl">
          Multumim — am primit comanda
        </h1>
        <p className="text-muted-foreground mt-3">
          Numar comanda{" "}
          <span className="text-foreground font-mono font-semibold">
            {order.id}
          </span>
        </p>
        <p className="mt-2 text-sm">
          Te sunam la {order.phone} pentru confirmare. Nu ai platit nimic inca.
        </p>
        {/*
          Only claimed when the send succeeded. An order placed before this flag
          existed reads as undefined and says nothing either way.
        */}
        {order.confirmationSent && (
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-sm">
            <Mail aria-hidden className="size-4 shrink-0" />
            Ti-am trimis confirmarea pe email la {order.email}.
          </p>
        )}
      </div>

      <section
        aria-labelledby="next-heading"
        className="border-border bg-card mt-10 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="next-heading" className="font-semibold">
          Ce urmeaza
        </h2>
        <ol className="mt-4 space-y-4">
          {nextSteps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className={
                  index === 0
                    ? "bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
                    : "bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
                }
              >
                <step.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-muted-foreground text-sm">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="order-heading"
        className="border-border bg-card mt-6 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="order-heading" className="mb-5 font-semibold">
          Produse comandate
        </h2>
        <OrderLines lines={lines} />
        <p className="border-border mt-5 flex items-baseline justify-between border-t pt-4 font-medium">
          <span>Total</span>
          <span className="text-xl font-semibold tabular-nums">
            {formatMoney(order.total)}
          </span>
        </p>

        <div className="border-border mt-5 flex gap-3 border-t pt-5 text-sm">
          <MapPin
            aria-hidden
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <p>
            <span className="font-medium">{order.name}</span>
            <br />
            <span className="text-muted-foreground">
              {order.address}
              <br />
              {order.email}
            </span>
          </p>
        </div>

        {order.billing && (
          <div className="border-border mt-5 flex gap-3 border-t pt-5 text-sm">
            <Building2
              aria-hidden
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
            <p>
              <span className="font-medium">
                Factura pe firma {order.billing.company}
              </span>
              <br />
              <span className="text-muted-foreground">
                CUI {order.billing.cui}
                {order.billing.regCom && ` · ${order.billing.regCom}`}
              </span>
            </p>
          </div>
        )}
      </section>

      <div className="mt-8 text-center">
        <Button size="xl" asChild>
          <Link href="/modele">Continua cumparaturile</Link>
        </Button>
      </div>
    </div>
  );
}

const bar = "bg-muted animate-pulse rounded";

/** The confirmation's shape: steps, badge, heading, "Ce urmeaza", products. */
function OrderSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-8 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${bar} h-6 w-24 rounded-full`} />
        ))}
      </div>
      <div className="flex flex-col items-center">
        <div className={`${bar} size-14 rounded-full`} />
        <div className={`${bar} mt-5 h-8 w-80 max-w-full`} />
        <div className={`${bar} mt-3 h-5 w-48`} />
        <div className={`${bar} mt-2 h-5 w-96 max-w-full`} />
      </div>
      <div className="border-border mt-10 space-y-4 rounded-xl border p-5 sm:p-6">
        <div className={`${bar} h-5 w-28`} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className={`${bar} size-8 shrink-0 rounded-full`} />
            <div className="flex-1 space-y-1.5">
              <div className={`${bar} h-4 w-40`} />
              <div className={`${bar} h-4 w-64 max-w-full`} />
            </div>
          </div>
        ))}
      </div>
      <div className="border-border mt-6 space-y-5 rounded-xl border p-5 sm:p-6">
        <div className={`${bar} h-5 w-40`} />
        <div className="flex items-center gap-3">
          <div className={`${bar} size-14 shrink-0 rounded-md`} />
          <div className={`${bar} h-4 flex-1`} />
          <div className={`${bar} h-4 w-20`} />
        </div>
        <div className={`${bar} h-7 w-full`} />
      </div>
      <span className="sr-only">Se incarca comanda</span>
    </div>
  );
}

export default function OrderPage({ params }: PageProps<"/comenzi/[id]">) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
      <Reveal fallback={<OrderSkeleton />}>
        <OrderDetail params={params} />
      </Reveal>
    </main>
  );
}
