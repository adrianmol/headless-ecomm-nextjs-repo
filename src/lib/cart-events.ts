/**
 * "Something was just added to the basket", from any add-to-cart button to the
 * one toast that announces it.
 *
 * A DOM event rather than a context or store: the buttons are client leaves
 * scattered through Server Component trees, and a provider around them would
 * have to sit in a layout and turn it into a client boundary. The event keeps
 * both ends as independent leaves.
 *
 * Display only. Nothing here is a price or a quantity the customer is charged;
 * the basket page re-prices from HUB on every render.
 */
export const CART_ADDED_EVENT = "reprint:cart-added";

export type CartAddedDetail = {
  name?: string;
  imageUrl?: string | null;
};

export function announceCartAdded(detail: CartAddedDetail): void {
  window.dispatchEvent(new CustomEvent(CART_ADDED_EVENT, { detail }));
}
