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
    <Button
      type="submit"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Se trimite…" : "Plaseaza comanda"}
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
  hidden = {},
}: {
  /** Server-minted values the action checks, e.g. the total shown. */
  hidden?: Record<string, string>;
  action: (
    state: CheckoutFormState,
    formData: FormData,
  ) => Promise<CheckoutFormState>;
}) {
  const [state, formAction] = useActionState(action, initialCheckoutState);
  const errors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    // noValidate is deliberate: with native validation on, the browser blocks
    // submission before the Server Action runs, so our Zod messages never
    // appear and the two validators drift apart. The server is the source of
    // truth for validity; the browser must not pre-empt it.
    <form action={formAction} noValidate className="space-y-4">
      {state.status !== "idle" && state.status !== "invalid" && (
        <p role="alert" className="text-destructive text-sm">
          {state.status === "empty" &&
            "Cosul este gol sau a expirat. Adauga produse si incearca din nou."}
          {state.status === "out_of_stock" &&
            "Un produs din cos tocmai s-a epuizat. Verifica cosul si incearca din nou."}
          {state.status === "price_changed" &&
            "Pretul s-a schimbat intre timp. Verifica noul total si trimite din nou comanda."}
          {state.status === "error" &&
            "Nu am putut trimite comanda. Incearca din nou sau suna-ne."}
        </p>
      )}

      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email}
      />
      <Field
        name="name"
        label="Nume complet"
        autoComplete="name"
        error={errors.name}
      />
      <Field
        name="phone"
        label="Telefon"
        type="tel"
        autoComplete="tel"
        error={errors.phone}
      />
      <Field
        name="line1"
        label="Adresa"
        autoComplete="address-line1"
        error={errors.line1}
      />
      <Field
        name="city"
        label="Oras"
        autoComplete="address-level2"
        error={errors.city}
      />
      <Field
        name="postcode"
        label="Cod postal"
        autoComplete="postal-code"
        error={errors.postcode}
      />
      <Field
        name="country"
        label="Cod tara"
        autoComplete="country"
        error={errors.country}
      />

      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <SubmitButton />
    </form>
  );
}
