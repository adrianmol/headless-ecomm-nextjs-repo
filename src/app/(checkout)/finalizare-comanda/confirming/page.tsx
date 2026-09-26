import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pollOrderStatusAction } from "@/commerce/checkout/actions";
import { PaymentConfirming } from "@/components/commerce/payment-confirming";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

async function Confirming({
  searchParams,
}: {
  searchParams: PageProps<"/finalizare-comanda/confirming">["searchParams"];
}) {
  const { ref } = await searchParams;

  // `ref` is an opaque identifier from the URL and is treated as untrusted.
  // Nothing is rendered from it beyond the reference itself; the status comes
  // from the backend on every poll.
  if (typeof ref !== "string" || ref.length === 0) redirect("/cos");

  return <PaymentConfirming orderRef={ref} poll={pollOrderStatusAction} />;
}

export default function ConfirmingPage({
  searchParams,
}: PageProps<"/finalizare-comanda/confirming">) {
  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <Reveal
        fallback={
          // PaymentConfirming's shape: spinner, heading, two lines of text.
          <div className="flex flex-col items-center" aria-hidden>
            <div className="bg-muted size-10 animate-pulse rounded-full" />
            <div className="bg-muted mt-5 h-8 w-56 animate-pulse rounded" />
            <div className="bg-muted mt-3 h-5 w-80 max-w-full animate-pulse rounded" />
            <div className="bg-muted mt-2 h-5 w-64 max-w-full animate-pulse rounded" />
          </div>
        }
      >
        <Confirming searchParams={searchParams} />
      </Reveal>
    </main>
  );
}
