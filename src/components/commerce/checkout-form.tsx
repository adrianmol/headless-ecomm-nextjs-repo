"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  initialCheckoutState,
  type CheckoutFormState,
} from "@/lib/checkout-form";

function Field({
  name,
  label,
  type = "text",
  autoComplete,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        // Native validation stays off: the server is the source of truth for
        // validity, and duplicating the rules in the browser lets the two drift.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="border-input focus-visible:ring-ring mt-1 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none aria-invalid:border-red-500"
      />
      {/* Reserved height so a message appearing does not shift the form. */}
      <p id={errorId} className="text-destructive mt-1 min-h-4 text-xs">
        {error ?? ""}
      </p>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Redirecting to payment…" : "Continue to payment"}
    </Button>
  );
}

/**
 * Client leaf. The Server Action arrives as a prop, keeping `components/` free
 * of data-layer imports.
 *
 * No card fields anywhere: payment is a hosted redirect, so card data never
 * touches this origin and PCI scope stays minimal.
 */
export function CheckoutForm({
  action,
}: {
  action: (
    state: CheckoutFormState,
    formData: FormData,
  ) => Promise<CheckoutFormState>;
}) {
  const [state, formAction] = useActionState(action, initialCheckoutState);
  const errors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="space-y-4">
      {state.status !== "idle" && state.status !== "invalid" && (
        <p role="alert" className="text-destructive text-sm">
          {state.status === "empty" &&
            "Your basket is empty or has expired. Add something to it and try again."}
          {state.status === "out_of_stock" &&
            "Something in your basket just sold out. Review it and try again."}
          {state.status === "price_changed" &&
            "A price changed while you were checking out. Review your basket to see the new total before paying."}
          {state.status === "error" &&
            "We could not start checkout. Please try again."}
        </p>
      )}

      <Field name="email" label="Email" type="email" autoComplete="email" error={errors.email} />
      <Field name="name" label="Full name" autoComplete="name" error={errors.name} />
      <Field name="line1" label="Address" autoComplete="address-line1" error={errors.line1} />
      <Field name="city" label="City" autoComplete="address-level2" error={errors.city} />
      <Field name="postcode" label="Postcode" autoComplete="postal-code" error={errors.postcode} />
      <Field
        name="country"
        label="Country code"
        autoComplete="country"
        error={errors.country}
      />

      <SubmitButton />
      <p className="text-muted-foreground text-xs">
        You will be taken to our payment provider to complete your purchase.
      </p>
    </form>
  );
}
