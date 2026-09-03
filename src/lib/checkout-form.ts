/**
 * Checkout form state, shared between the Server Action and the client form.
 *
 * Lives in lib/ so `components/` can import it without reaching into the data
 * layer. Carries machine-readable status plus per-field messages; the component
 * decides the wording for everything except field-level validation hints, which
 * are already customer-facing copy written by us, not backend prose.
 */
export type CheckoutFormState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Record<string, string> }
  | { status: "empty" }
  | { status: "out_of_stock" }
  | { status: "price_changed" }
  | { status: "error" };

export const initialCheckoutState: CheckoutFormState = { status: "idle" };
