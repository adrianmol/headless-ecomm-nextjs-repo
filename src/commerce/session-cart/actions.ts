"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { CartFeedback } from "@/lib/cart-feedback";
import type { CheckoutFormState } from "@/lib/checkout-form";
import { isSameOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { parseCheckout, submittedValues } from "../checkout/form-schema";
import { getHubProduct } from "../hub/queries";
import {
  MAX_LINES,
  MAX_QUANTITY,
  priceCart,
  readCartLines,
  toStoredLine,
  writeCartLines,
  writeLastOrder,
  type SessionOrder,
} from "./cart";
import { sendCustomerConfirmation, sendOrderEmail } from "./order-email";

/**
 * Write path for the session cart. Same contract as `cart/actions.ts` — same
 * feedback union, same origin check, `refresh()` after every write — so the
 * existing client islands work unchanged. `lineId` is the sku.
 *
 * No idempotency key: there is no backend to collapse retries against. The
 * button disables while pending, which covers the double-click.
 */

export async function addHubToCartAction(input: {
  variantId: string;
  quantity: number;
  seed: string;
}): Promise<CartFeedback> {
  if (!(await isSameOrigin())) return { status: "error", retryable: false };
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { status: "error", retryable: false };
  }

  const lines = await readCartLines();
  const existing = lines.find((line) => line.sku === input.variantId);
  if (!existing && lines.length >= MAX_LINES) {
    return { status: "error", retryable: false };
  }

  let name: string;
  let priced;
  try {
    // The name comes from HUB, never from the client, so the sku must be real.
    const product = await getHubProduct({ by: "sku", value: input.variantId });
    if (!product) return { status: "error", retryable: false };
    name = product.name;

    const quantity = (existing?.quantity ?? 0) + input.quantity;
    priced = await priceCart([toStoredLine(product.sku, name, quantity)]);
  } catch {
    return { status: "error", retryable: true };
  }

  const line = priced.lines[0];
  if (!line) return { status: "out_of_stock", available: 0 };

  const quantity = Math.min(line.quantity, line.maxQuantity);
  const next = existing
    ? lines.map((l) => (l.sku === line.sku ? { ...l, quantity } : l))
    : [...lines, toStoredLine(line.sku, name, quantity)];
  await writeCartLines(next);

  refresh();
  if (quantity < line.quantity) {
    return { status: "out_of_stock", available: line.maxQuantity };
  }
  return { status: "ok" };
}

export async function setHubLineQuantityAction(input: {
  lineId: string;
  quantity: number;
}): Promise<CartFeedback> {
  if (!(await isSameOrigin())) return { status: "error", retryable: false };
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 0 ||
    input.quantity > MAX_QUANTITY
  ) {
    return { status: "error", retryable: false };
  }

  const lines = await readCartLines();
  if (!lines.some((line) => line.sku === input.lineId)) {
    return { status: "cart_expired" };
  }

  // Quantity 0 is a removal, as in the backend cart.
  await writeCartLines(
    input.quantity === 0
      ? lines.filter((line) => line.sku !== input.lineId)
      : lines.map((line) =>
          line.sku === input.lineId
            ? { ...line, quantity: input.quantity }
            : line,
        ),
  );

  refresh();
  return { status: "ok" };
}

export async function removeHubLineAction(input: {
  lineId: string;
}): Promise<CartFeedback> {
  return setHubLineQuantityAction({ lineId: input.lineId, quantity: 0 });
}

/** Minted per checkout page render; see `placeSessionOrderAction`. */
const orderKeySchema = z.uuid();

/**
 * Places an order: emails it to the shop, sends the customer their copy, then
 * records it in the session. No PSP and nothing is charged — the shop confirms
 * by phone.
 *
 * The cart is re-priced here, at submit, rather than trusting the figure the
 * page rendered. `expectedTotal` is what the customer was shown; if the live
 * total differs the order stops and they see the new one — never charged
 * silently, even in a stopgap.
 *
 * `orderKey` is minted when the checkout page renders, so a double-submit or a
 * retried action carries the same key: the email is sent once (Resend honours
 * the idempotency key) and the order number is the same. A fresh page load is a
 * fresh attempt. The customer can choose the key, which only lets them choose
 * their own order number.
 */
export async function placeSessionOrderAction(
  _previous: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  if (!(await isSameOrigin())) return { status: "error" };

  const values = submittedValues(formData);
  const parsed = parseCheckout(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  }

  const orderKey = orderKeySchema.safeParse(formData.get("orderKey"));
  if (!orderKey.success) return { status: "error", values };

  const lines = await readCartLines();
  if (lines.length === 0) return { status: "empty", values };

  let cart;
  try {
    cart = await priceCart(lines);
  } catch {
    return { status: "error", values };
  }

  if (
    !cart.total ||
    cart.unavailable.length > 0 ||
    cart.lines.some((line) => line.quantity > line.maxQuantity)
  ) {
    return { status: "out_of_stock", values };
  }
  if (formData.get("expectedTotal") !== String(cart.total.amountMinor)) {
    // Re-render the summary so the new total is on screen beside the message.
    refresh();
    return { status: "price_changed", values };
  }

  const { email, name, phone, line1, city, postcode, country, county } =
    parsed.data;
  const region = county ? `jud. ${county}, ` : "";
  const order: SessionOrder = {
    id: orderKey.data.slice(0, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
    email,
    name,
    phone,
    address: `${line1}, ${postcode} ${city}, ${region}${country}`,
    billing:
      parsed.data.customerType === "pj"
        ? {
            company: parsed.data.company,
            cui: parsed.data.cui,
            regCom: parsed.data.regCom,
          }
        : undefined,
    lines: cart.lines.map(({ sku, name, quantity, lineTotal }) => ({
      sku,
      name,
      quantity,
      lineTotal,
    })),
    total: cart.total,
  };

  // The shop hearing of it is the order. Until then the cart stays intact, so a
  // failed send can simply be retried.
  if (!(await sendOrderEmail(order, `order:${orderKey.data}`))) {
    return { status: "error", values };
  }

  // The order stands from here on; the customer's copy cannot un-place it.
  const confirmationSent = await sendCustomerConfirmation(
    order,
    `order:${orderKey.data}:customer`,
  );

  await writeLastOrder({ ...order, confirmationSent });
  await writeCartLines([]);

  redirect(`/comenzi/${order.id}`);
}
