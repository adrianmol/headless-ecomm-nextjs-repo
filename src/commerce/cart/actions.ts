"use server";

import type { CartFeedback } from "@/lib/cart-feedback";
import { CommerceErrorException, type CommerceError } from "../errors";
import { clearCartId, getCartId, setCartId } from "../session";
import {
  addCartLine,
  createCart,
  removeCartLine,
  updateCartLineQuantity,
} from "./mutations";
import { getCart, type Cart } from "./queries";

/**
 * The write path for the cart. These are the only functions permitted to mutate
 * it, and the only place that touches the cart cookie.
 *
 * No cache invalidation happens here on purpose. The cart is never cached, so
 * there is no tag to expire — invoking a Server Action already re-renders the
 * current route's Server Components, which is what refreshes the cart UI.
 * (`updateTag` would be the tool if any of this were cached; it is not.)
 */

function toFeedback(error: CommerceError): CartFeedback {
  switch (error.kind) {
    case "OutOfStock":
      return { status: "out_of_stock", available: error.available };
    case "PriceChanged":
      return { status: "price_changed", newPrice: error.newPrice };
    case "CartExpired":
    case "NotFound":
      return { status: "cart_expired" };
    case "Unauthorized":
      return { status: "error", retryable: false };
    case "ValidationFailed":
      return { status: "error", retryable: false };
    case "Unavailable":
      return { status: "error", retryable: error.retryable };
  }
}

/** Turns a thrown read error into a domain error without swallowing real faults. */
async function readCart(cartId: string): Promise<Cart | CommerceError> {
  try {
    return await getCart(cartId);
  } catch (error) {
    if (error instanceof CommerceErrorException) return error.error;
    throw error;
  }
}

/**
 * Resolves the visitor's cart, creating one on first write.
 *
 * Cart creation happens here — in an action — and never during render, because
 * cookies cannot be set while rendering. It is also why an empty cart is never
 * created on a page view, which keeps abandonment metrics honest.
 */
async function resolveCart(seed: string): Promise<Cart | CommerceError> {
  const existing = await getCartId();

  if (existing) {
    const cart = await readCart(existing);
    if (!("kind" in cart)) return cart;

    // A cart the backend no longer recognises is recoverable: drop the stale
    // cookie and start a new one rather than dead-ending the shopper.
    if (cart.kind !== "CartExpired" && cart.kind !== "NotFound") return cart;
    await clearCartId();
  }

  const created = await createCart(seed);
  if (!created.ok) return created.error;

  await setCartId(created.data.id);
  return created.data;
}

export async function addToCartAction(input: {
  variantId: string;
  quantity: number;
  /**
   * Stable across retries of one intent (the client sends a per-button id).
   * Only used when creating the visitor's first cart; without it a
   * double-clicked first add would create two carts.
   */
  seed: string;
}): Promise<CartFeedback> {
  const cart = await resolveCart(input.seed);
  if ("kind" in cart) return toFeedback(cart);

  const result = await addCartLine({
    cartId: cart.id,
    cartVersion: cart.version,
    variantId: input.variantId,
    quantity: input.quantity,
  });

  return result.ok ? { status: "ok" } : toFeedback(result.error);
}

export async function setLineQuantityAction(input: {
  lineId: string;
  quantity: number;
}): Promise<CartFeedback> {
  const cartId = await getCartId();
  if (!cartId) return { status: "cart_expired" };

  const cart = await readCart(cartId);
  if ("kind" in cart) return toFeedback(cart);

  // Quantity 0 is a removal; the backend models it that way so the client does
  // not need a separate code path for "stepped down to nothing".
  const result = await updateCartLineQuantity({
    cartId,
    cartVersion: cart.version,
    lineId: input.lineId,
    quantity: input.quantity,
  });

  return result.ok ? { status: "ok" } : toFeedback(result.error);
}

export async function removeLineAction(input: {
  lineId: string;
}): Promise<CartFeedback> {
  const cartId = await getCartId();
  if (!cartId) return { status: "cart_expired" };

  const cart = await readCart(cartId);
  if ("kind" in cart) return toFeedback(cart);

  const result = await removeCartLine({
    cartId,
    cartVersion: cart.version,
    lineId: input.lineId,
  });

  return result.ok ? { status: "ok" } : toFeedback(result.error);
}
