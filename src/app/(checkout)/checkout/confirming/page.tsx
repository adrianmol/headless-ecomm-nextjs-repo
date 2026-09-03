import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pollOrderStatusAction } from "@/commerce/checkout/actions";
import { PaymentConfirming } from "@/components/commerce/payment-confirming";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

async function Confirming({
  searchParams,
}: {
  searchParams: PageProps<"/checkout/confirming">["searchParams"];
}) {
  const { ref } = await searchParams;

  // `ref` is an opaque identifier from the URL and is treated as untrusted.
  // Nothing is rendered from it beyond the reference itself; the status comes
  // from the backend on every poll.
  if (typeof ref !== "string" || ref.length === 0) redirect("/cart");

  return <PaymentConfirming orderRef={ref} poll={pollOrderStatusAction} />;
}

export default function ConfirmingPage({
  searchParams,
}: PageProps<"/checkout/confirming">) {
  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <Suspense
        fallback={<div className="bg-muted h-32 animate-pulse rounded-lg" />}
      >
        <Confirming searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
