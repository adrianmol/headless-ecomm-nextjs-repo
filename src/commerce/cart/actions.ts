"use server";

import { refresh } from "next/cache";
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
 * There is no cache to invalidate — the cart is never cached, so no tag exists
 * to expire and `revalidateTag`/`updateTag` have nothing to act on.
 *
 * A successful mutation still has to call `refresh()`. Mutating server state
 * does not by itself re-render the Server Components already on screen, so
 * without it the backend and the page silently disagree: the line is gone from
 * the cart but still rendered, with no error to explain it. Caught by E2E, not
 * by unit tests, because the data layer was behaving perfectly.
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

  if (!result.ok) return toFeedback(result.error);

  // Re-render the Server Components showing the cart. Without this the write
  // lands but the page keeps rendering the pre-mutation state.
  refresh();
  return { status: "ok" };
}

export async function setLineQuantityAction(input: {
  lineId: string;
  quantity: number;
}): Promise<CartFeedback> {
  // Defence in depth. A client bug once sent Infinity here, which serialises to
  // null and was read downstream as 0 — silently deleting the line. Server
  // Actions are a public HTTP surface regardless, so the argument is validated
  // rather than trusted.
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return { status: "error", retryable: false };
  }

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

  if (!result.ok) return toFeedback(result.error);

  // Re-render the Server Components showing the cart. Without this the write
  // lands but the page keeps rendering the pre-mutation state.
  refresh();
  return { status: "ok" };
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

  if (!result.ok) return toFeedback(result.error);

  // Re-render the Server Components showing the cart. Without this the write
  // lands but the page keeps rendering the pre-mutation state.
  refresh();
  return { status: "ok" };
}
