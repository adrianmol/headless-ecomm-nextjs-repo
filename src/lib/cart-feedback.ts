import type { Money } from "./money";

/**
 * The UI-facing result of a cart mutation.
 *
 * Deliberately not `CommerceError`. This crosses the server/client boundary and
 * is consumed by components, which must not import the data layer, so it is a
 * small serialisable union carrying only what the UI needs to decide what to
 * render. Like `ValidationFailed`, it exposes machine-readable status rather
 * than backend prose — components supply their own copy.
 */
export type CartFeedback =
  | { status: "ok" }
  | { status: "out_of_stock"; available: number }
  | { status: "price_changed"; newPrice: Money }
  | { status: "cart_expired" }
  | { status: "error"; retryable: boolean };

export type CartAction = (input: {
  variantId: string;
  quantity: number;
  seed: string;
}) => Promise<CartFeedback>;

export type QuantityAction = (input: {
  lineId: string;
  quantity: number;
}) => Promise<CartFeedback>;
