/**
 * Checkout form state, shared between the Server Action and the client form.
 *
 * Lives in lib/ so `components/` can import it without reaching into the data
 * layer. Carries machine-readable status plus per-field messages; the component
 * decides the wording for everything except field-level validation hints, which
 * are already customer-facing copy written by us, not backend prose.
 */
type CheckoutOutcome =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Record<string, string> }
  | { status: "empty" }
  | { status: "out_of_stock" }
  | { status: "price_changed" }
  | { status: "error" };

/**
 * `values` echoes back what the customer typed. React resets an uncontrolled
 * form after every action, success or not, so without it one validation error
 * wipes the whole address. The form renders these as `defaultValue`, which is
 * what that reset restores to.
 */
export type CheckoutFormState = CheckoutOutcome & {
  values?: Record<string, string>;
};

export const initialCheckoutState: CheckoutFormState = { status: "idle" };
