"use client";

import {
  useActionState,
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  initialCheckoutState,
  type CheckoutFormState,
} from "@/lib/checkout-form";

/*
  Validity is still decided by the server. The select only saves typing an ISO
  code by hand, which no shopper knows; the schema accepts any two letters.
*/
const COUNTRIES = [
  { code: "RO", label: "Romania" },
  { code: "MD", label: "Republica Moldova" },
  { code: "BG", label: "Bulgaria" },
  { code: "HU", label: "Ungaria" },
] as const;

/** Visual order, so focus lands on the first error the eye would find. */
const FIELD_ORDER = [
  "email",
  "phone",
  "name",
  "line1",
  "city",
  "postcode",
  "country",
] as const;

const controlClasses =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/30 mt-1.5 h-11 w-full rounded-lg border px-3 text-base transition-colors focus-visible:ring-3 focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm";

function Field({
  name,
  label,
  hint,
  error,
  defaultValue,
  className,
  ...input
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  className?: string;
} & Pick<
  ComponentProps<"input">,
  "type" | "autoComplete" | "inputMode" | "autoCapitalize" | "spellCheck"
>) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean);

  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue}
        // Native validation stays off: the server is the source of truth for
        // validity, and duplicating the rules in the browser lets the two drift.
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy.length ? describedBy.join(" ") : undefined}
        className={controlClasses}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-muted-foreground mt-1 text-xs">
          {hint}
        </p>
      )}
      {/* Reserved height so a message appearing does not shift the form. */}
      <p id={errorId} className="text-destructive mt-1 min-h-4 text-xs">
        {error ?? ""}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-border bg-card rounded-xl border p-5 sm:p-6">
      <legend className="float-left mb-4 w-full font-semibold">{title}</legend>
      <div className="clear-left grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {children}
      </div>
    </fieldset>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="xl"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending && <Loader2 aria-hidden className="animate-spin" />}
      {pending ? "Se trimite…" : "Plaseaza comanda"}
    </Button>
  );
}

const STATUS_MESSAGE: Partial<Record<CheckoutFormState["status"], string>> = {
  empty: "Cosul este gol sau a expirat. Adauga produse si incearca din nou.",
  out_of_stock:
    "Un produs din cos tocmai s-a epuizat. Verifica cosul si incearca din nou.",
  price_changed:
    "Pretul s-a schimbat intre timp. Verifica noul total si trimite din nou comanda.",
  error: "Nu am putut trimite comanda. Incearca din nou sau suna-ne.",
};

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
  const values = state.values ?? {};
  const message = STATUS_MESSAGE[state.status];

  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  // After a failed submit, take the customer to what needs fixing instead of
  // leaving focus on a button at the bottom of a long form.
  useEffect(() => {
    if (state.status === "invalid") {
      const first = FIELD_ORDER.find((name) => state.fieldErrors[name]);
      const field = first && formRef.current?.elements.namedItem(first);
      if (field instanceof HTMLElement) field.focus();
    } else if (state.status !== "idle") {
      alertRef.current?.scrollIntoView({ block: "center" });
    }
  }, [state]);

  return (
    // noValidate is deliberate: with native validation on, the browser blocks
    // submission before the Server Action runs, so our Zod messages never
    // appear and the two validators drift apart. The server is the source of
    // truth for validity; the browser must not pre-empt it.
    <form ref={formRef} action={formAction} noValidate className="space-y-5">
      {message && (
        <div
          ref={alertRef}
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      )}

      <Section title="Date de contact">
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={values.email}
          error={errors.email}
        />
        <Field
          name="phone"
          label="Telefon"
          type="tel"
          autoComplete="tel"
          hint="Te sunam pentru confirmarea comenzii."
          defaultValue={values.phone}
          error={errors.phone}
        />
      </Section>

      <Section title="Livrare">
        <Field
          name="name"
          label="Nume complet"
          autoComplete="name"
          defaultValue={values.name}
          error={errors.name}
          className="sm:col-span-2"
        />
        <Field
          name="line1"
          label="Adresa"
          autoComplete="street-address"
          hint="Strada, numar, bloc, scara, apartament"
          defaultValue={values.line1}
          error={errors.line1}
          className="sm:col-span-2"
        />
        <Field
          name="city"
          label="Oras"
          autoComplete="address-level2"
          defaultValue={values.city}
          error={errors.city}
        />
        <Field
          name="postcode"
          label="Cod postal"
          autoComplete="postal-code"
          inputMode="numeric"
          defaultValue={values.postcode}
          error={errors.postcode}
        />
        <div className="sm:col-span-2">
          <label htmlFor="country" className="block text-sm font-medium">
            Tara
          </label>
          <select
            id="country"
            name="country"
            autoComplete="country"
            defaultValue={values.country ?? "RO"}
            aria-invalid={errors.country ? true : undefined}
            aria-describedby={errors.country ? "country-error" : undefined}
            className={controlClasses}
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
          <p id="country-error" className="text-destructive mt-1 min-h-4 text-xs">
            {errors.country ?? ""}
          </p>
        </div>
      </Section>

      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="space-y-3">
        <SubmitButton />
        <p className="text-muted-foreground text-center text-xs">
          Nu platesti nimic acum. Te sunam pentru confirmare, apoi livram.
        </p>
      </div>
    </form>
  );
}
