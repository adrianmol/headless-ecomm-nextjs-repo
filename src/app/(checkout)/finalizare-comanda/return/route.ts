import { redirect } from "next/navigation";
import { getOrder } from "@/commerce/checkout/queries";
import { CommerceErrorException } from "@/commerce/errors";

/**
 * Where the customer lands after the hosted payment provider.
 *
 * EVERY query parameter here is attacker-controlled. The customer can edit the
 * URL, and so can anyone who sends them a link. `ref` is read as an opaque
 * identifier and nothing else: the order's real state is fetched from our own
 * backend, which is the only party that has heard from the PSP.
 *
 * Branching on something like `?status=success` is how a storefront ships free
 * products. Any other parameter the PSP appends — amount, signature, status —
 * is ignored outright; verifying PSP signatures is the backend's job, because
 * it holds the secret.
 *
 * `ref` alone is not authorisation either. getOrder goes through the
 * session-forwarding client so the backend can reject a reference that does not
 * belong to the caller.
 */
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref");

  if (!ref) redirect("/cos");

  let status: string;
  try {
    status = (await getOrder(ref)).status;
  } catch (error) {
    if (error instanceof CommerceErrorException) {
      // Cannot establish the truth, so assert nothing. The confirming screen
      // keeps polling; claiming failure here could tell somebody their
      // successful payment did not go through.
      redirect(`/finalizare-comanda/confirming?ref=${encodeURIComponent(ref)}`);
    }
    throw error;
  }

  switch (status) {
    case "paid":
      redirect(`/comenzi/${encodeURIComponent(ref)}`);
    case "failed":
    case "cancelled":
      redirect("/finalizare-comanda?error=payment_failed");
    default:
      // `pending` is normal, not an error: the PSP webhook may not have reached
      // the backend yet. Poll rather than guess.
      redirect(`/finalizare-comanda/confirming?ref=${encodeURIComponent(ref)}`);
  }
}
