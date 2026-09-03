import "server-only";
import { commerceClient } from "../client";
import { CommerceErrorException, normalizeError, schemaViolation } from "../errors";
import { orderSchema } from "../schemas";
import type { components } from "../api";

export type Order = components["schemas"]["Order"];

/**
 * The authoritative order state, and the only thing the storefront is allowed
 * to believe after a payment redirect.
 *
 * Never cached: order status changes underneath us when the PSP webhook lands,
 * and a cached "pending" shown to somebody who has paid is a support ticket.
 *
 * Goes through the session-forwarding client so the backend can authorise the
 * read. An order reference in a URL must not be enough to view someone's order.
 *
 * Status and total are runtime-validated (ADR-0003): both decide what the
 * customer is told they were charged.
 */
export async function getOrder(orderRef: string): Promise<Order> {
  const { data, error, response } = await commerceClient().GET(
    "/orders/{orderRef}",
    { params: { path: { orderRef } } },
  );

  if (error || !data) {
    throw new CommerceErrorException(normalizeError(error, response?.status));
  }

  const parsed = orderSchema.safeParse(data);
  if (!parsed.success) {
    throw new CommerceErrorException(schemaViolation());
  }
  return parsed.data;
}
