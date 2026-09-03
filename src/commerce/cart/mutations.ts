import "server-only";
import { commerceClient } from "../client";
import { normalizeError } from "../errors";
import type { CommerceError } from "../errors";
import { idempotencyKey } from "../idempotency";
import type { Cart } from "./queries";

/**
 * Mutations return a result union instead of throwing.
 *
 * Out-of-stock and price-changed are expected outcomes that a form has to
 * render, not faults. Throwing would push them into an error boundary and lose
 * the surrounding UI state.
 */
export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CommerceError };

export async function addCartLine(input: {
  cartId: string;
  cartVersion: number;
  variantId: string;
  quantity: number;
}): Promise<MutationResult<Cart>> {
  const { cartId, cartVersion, variantId, quantity } = input;

  const { data, error, response } = await commerceClient().POST(
    "/carts/{cartId}/lines",
    {
      params: {
        path: { cartId },
        header: {
          // Version-scoped: a retry of this intent collapses, but a genuine
          // second add (after the version moves) is applied.
          "Idempotency-Key": idempotencyKey(
            "add",
            cartId,
            cartVersion,
            variantId,
            quantity,
          ),
        },
      },
      body: { variantId, quantity },
    },
  );

  if (error || !data) {
    return { ok: false, error: normalizeError(error, response?.status) };
  }
  return { ok: true, data };
}

/**
 * Sets an absolute quantity, never a delta. The UI debounces and coalesces
 * rapid clicks, so deltas would race and converge on the wrong number.
 * Quantity 0 removes the line.
 */
export async function updateCartLineQuantity(input: {
  cartId: string;
  cartVersion: number;
  lineId: string;
  quantity: number;
}): Promise<MutationResult<Cart>> {
  const { cartId, cartVersion, lineId, quantity } = input;

  const { data, error, response } = await commerceClient().PATCH(
    "/carts/{cartId}/lines/{lineId}",
    {
      params: {
        path: { cartId, lineId },
        header: {
          "Idempotency-Key": idempotencyKey(
            "qty",
            cartId,
            cartVersion,
            lineId,
            quantity,
          ),
        },
      },
      body: { quantity },
    },
  );

  if (error || !data) {
    return { ok: false, error: normalizeError(error, response?.status) };
  }
  return { ok: true, data };
}

export async function removeCartLine(input: {
  cartId: string;
  cartVersion: number;
  lineId: string;
}): Promise<MutationResult<Cart>> {
  const { cartId, cartVersion, lineId } = input;

  const { data, error, response } = await commerceClient().DELETE(
    "/carts/{cartId}/lines/{lineId}",
    {
      params: {
        path: { cartId, lineId },
        header: {
          "Idempotency-Key": idempotencyKey("rm", cartId, cartVersion, lineId),
        },
      },
    },
  );

  if (error || !data) {
    return { ok: false, error: normalizeError(error, response?.status) };
  }
  return { ok: true, data };
}

/**
 * Creates a cart. Called from a Server Action on first write, never during
 * render — cookies cannot be set while rendering.
 *
 * There is no cart id or version to key against yet, so the caller supplies the
 * seed. It MUST be stable across retries of the same logical request — a
 * per-visitor nonce issued before the action fires is the intended source.
 * Never `crypto.randomUUID()` at the call site: that is the random-key
 * anti-pattern this module exists to prevent, and it produces two carts on a
 * double-clicked first add-to-cart.
 */
export async function createCart(
  seed: string,
): Promise<MutationResult<Cart>> {
  const { data, error, response } = await commerceClient().POST("/carts", {
    params: { header: { "Idempotency-Key": idempotencyKey("create", seed) } },
  });

  if (error || !data) {
    return { ok: false, error: normalizeError(error, response?.status) };
  }
  return { ok: true, data };
}
