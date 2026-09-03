import "server-only";
import { commerceClient } from "../client";
import {
  CommerceErrorException,
  normalizeError,
  schemaViolation,
} from "../errors";
import { cartLineMoneySchema, cartTotalsSchema } from "../schemas";
import type { components } from "../api";

export type Cart = components["schemas"]["Cart"];

/**
 * Cart reads are never cached: the cart is per-user, mutable, and determines
 * what the customer is charged.
 *
 * Takes the cart id as an argument rather than reading the cookie itself. Only
 * the Server Action layer touches cookies, which keeps this function callable
 * from tests without a request scope.
 */
export async function getCart(cartId: string): Promise<Cart> {
  const { data, error, response } = await commerceClient().GET(
    "/carts/{cartId}",
    {
      params: { path: { cartId } },
    },
  );

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }

  // Totals are what the customer pays, so they are validated at runtime even
  // though the generated types already claim a shape.
  if (!cartTotalsSchema.safeParse(data.totals).success) {
    throw new CommerceErrorException(schemaViolation());
  }

  // Per-line money too, not just the aggregate. A corrupt `unitPrice` on one
  // line can coexist with a total that validates cleanly, because the backend
  // computes the total independently — and that line is what the customer sees.
  if (
    !data.lines.every((line) => cartLineMoneySchema.safeParse(line).success)
  ) {
    throw new CommerceErrorException(schemaViolation());
  }

  return data;
}
