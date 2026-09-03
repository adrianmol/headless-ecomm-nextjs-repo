import "server-only";
import { commerceClient } from "../client";
import { normalizeError } from "../errors";
import { idempotencyKey } from "../idempotency";
import type { MutationResult } from "../cart/mutations";
import type { components } from "../api";

export type CheckoutSession = components["schemas"]["CheckoutSession"];

/**
 * Creates the payment intent and returns the PSP redirect URL.
 *
 * The idempotency key is cart id + cart version, so a double-clicked Pay button
 * collapses into one order, while a genuine second checkout (after the cart
 * changed, hence a new version) is allowed through. This is the single most
 * expensive place to get idempotency wrong: the failure mode is charging a
 * customer twice.
 *
 * Uses the session-forwarding client — a checkout belongs to a person, unlike
 * catalog reads.
 */
export async function createCheckoutSession(input: {
  cartId: string;
  cartVersion: number;
  email: string;
}): Promise<MutationResult<CheckoutSession>> {
  const { cartId, cartVersion, email } = input;

  const { data, error, response } = await commerceClient().POST(
    "/checkout/sessions",
    {
      params: {
        header: {
          "Idempotency-Key": idempotencyKey("checkout", cartId, cartVersion),
        },
      },
      body: { cartId, cartVersion, email },
    },
  );

  if (error || !data) {
    return { ok: false, error: normalizeError(error, response?.status) };
  }
  return { ok: true, data };
}
