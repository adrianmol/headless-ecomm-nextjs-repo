"use server";

import { redirect } from "next/navigation";
import type { CheckoutFormState } from "@/lib/checkout-form";
import { checkPspRedirect } from "@/lib/psp-redirect";
import { isSameOrigin } from "@/lib/request-origin";
import { getCart } from "../cart/queries";
import { CommerceErrorException } from "../errors";
import { getCartId } from "../session";
import { createCheckoutSession } from "./mutations";
import { checkoutSchema, fieldErrors } from "./form-schema";
import { getOrder } from "./queries";

export async function startCheckoutAction(
  _previous: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  // Before anything else, and before any backend call: this action creates an
  // order. Next blocks a mismatched `Origin` but allows an absent one, so the
  // check is explicit here rather than inherited. See src/lib/request-origin.ts
  // for the measurements behind that.
  if (!(await isSameOrigin())) return { status: "error" };

  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "invalid", fieldErrors: fieldErrors(parsed.error) };
  }

  const cartId = await getCartId();
  if (!cartId) return { status: "empty" };

  let cart;
  try {
    cart = await getCart(cartId);
  } catch (error) {
    if (error instanceof CommerceErrorException) return { status: "empty" };
    throw error;
  }

  if (cart.lines.length === 0) return { status: "empty" };

  const session = await createCheckoutSession({
    cartId: cart.id,
    cartVersion: cart.version,
    email: parsed.data.email,
  });

  if (!session.ok) {
    // A price change must stop the flow. The customer sees and accepts the new
    // total; they are never quietly charged it.
    if (session.error.kind === "PriceChanged") {
      return { status: "price_changed" };
    }
    if (session.error.kind === "OutOfStock") return { status: "out_of_stock" };
    if (
      session.error.kind === "CartExpired" ||
      session.error.kind === "NotFound"
    ) {
      return { status: "empty" };
    }
    return { status: "error" };
  }

  /*
    The only off-origin redirect in the storefront, and the customer's next click
    is on a page where they expect to type card details. Validated before we send
    them, so a backend bug cannot turn the checkout button into a phishing hop.
  */
  const target = checkPspRedirect(session.data.redirectUrl);
  if (!target.ok) {
    // Host and reason, never the URL: a provider redirect commonly carries a
    // session token in its query string.
    console.error(
      JSON.stringify({
        event: "psp_redirect_rejected",
        reason: target.reason,
        host: target.host,
      }),
    );
    return { status: "error" };
  }

  // Outside the try/catch above on purpose: redirect() signals by throwing, and
  // catching it would swallow the navigation.
  redirect(target.url);
}

/**
 * Polled by the confirming screen while the PSP webhook is in flight. Returns
 * only the status — never the total or anything else the page could be tempted
 * to render from a client-held value.
 */
export async function pollOrderStatusAction(
  orderRef: string,
): Promise<"pending" | "paid" | "failed" | "cancelled" | "unknown"> {
  try {
    return (await getOrder(orderRef)).status;
  } catch {
    return "unknown";
  }
}
