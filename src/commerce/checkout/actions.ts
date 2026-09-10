"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { CheckoutFormState } from "@/lib/checkout-form";
import { isSameOrigin } from "@/lib/request-origin";
import { getCart } from "../cart/queries";
import { CommerceErrorException } from "../errors";
import { getCartId } from "../session";
import { createCheckoutSession } from "./mutations";
import { getOrder } from "./queries";

/**
 * Client-side shape checking for UX only. The backend re-validates and is the
 * enforcement point; nothing here is a control. Kept deliberately loose —
 * over-strict address rules reject legitimate customers, and the payment
 * provider and carrier both validate properly downstream.
 */
const checkoutSchema = z.object({
  email: z.email("Introdu o adresa de email valida"),
  name: z.string().trim().min(1, "Introdu numele"),
  line1: z.string().trim().min(1, "Introdu adresa"),
  city: z.string().trim().min(1, "Introdu orasul"),
  postcode: z.string().trim().min(1, "Introdu codul postal"),
  country: z.string().trim().length(2, "Alege tara"),
});

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
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      fieldErrors[field] ??= issue.message;
    }
    return { status: "invalid", fieldErrors };
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

  // Outside the try/catch above on purpose: redirect() signals by throwing, and
  // catching it would swallow the navigation.
  redirect(session.data.redirectUrl);
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
