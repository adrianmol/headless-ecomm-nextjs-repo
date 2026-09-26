"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
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
import { suggestEmail } from "@/lib/email-typo";
import { formatMoney, type Money } from "@/lib/money";
import { RO_COUNTIES } from "@/lib/ro-counties";
import { cn } from "@/lib/utils";

/*
  Validity is still decided by the server. The select only saves typing an ISO
  code by hand, which no shopper knows; the schema accepts any two letters.
  Romania gets a county list, which the server checks; elsewhere the region is
  optional free text.
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
  "country",
  "line1",
  "city",
  "county",
  "postcode",
  "company",
  "cui",
  "regCom",
] as const;

const CUSTOMER_TYPES = [
  { value: "pf", label: "Persoana fizica", hint: "Factura pe numele tau" },
  { value: "pj", label: "Persoana juridica", hint: "Factura pe firma, cu CUI" },
] as const;

type CustomerType = (typeof CUSTOMER_TYPES)[number]["value"];

const controlClasses =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/30 mt-1.5 h-11 w-full rounded-lg border px-3 text-base transition-colors focus-visible:ring-3 focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm";

function Field({
  name,
  label,
  hint,
  error,
  defaultValue,
  className,
  children,
  ...input
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  className?: string;
  /** Extra guidance under the hint, e.g. a typo suggestion. */
  children?: ReactNode;
} & Pick<
  ComponentProps<"input">,
  | "type"
  | "autoComplete"
  | "inputMode"
  | "autoCapitalize"
  | "spellCheck"
  | "onBlur"
  | "onInput"
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
        aria-describedby={
          describedBy.length ? describedBy.join(" ") : undefined
        }
        className={controlClasses}
        // The phone keyboard's return key moves on rather than submitting.
        enterKeyHint="next"
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-muted-foreground mt-1 text-xs">
          {hint}
        </p>
      )}
      {children}
      {/* Reserved height so a message appearing does not shift the form. */}
      <p id={errorId} className="text-destructive mt-1 min-h-4 text-xs">
        {error ?? ""}
      </p>
    </div>
  );
}

function SelectField({
  name,
  label,
  error,
  className,
  children,
  ...select
}: {
  name: string;
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
} & Pick<
  ComponentProps<"select">,
  "autoComplete" | "defaultValue" | "onChange"
>) {
  const errorId = `${name}-error`;
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={controlClasses}
        {...select}
      >
        {children}
      </select>
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
  total,
  hidden = {},
}: {
  /**
   * Server-computed, shown beside the submit button so the amount is in view
   * when the customer commits — on phones the summary is collapsed above.
   * Display only; the action re-prices and checks it independently.
   */
  total?: Money;
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

  // Uncontrolled like the text fields, so React's post-action form reset
  // restores the submitted choice from `values`. As controlled inputs the reset
  // put the DOM back to "pf" while state still said "pj". The state only
  // decides which dependent fields render.
  const [country, setCountry] = useState(values.country ?? "RO");
  const [customerType, setCustomerType] = useState<CustomerType>(
    values.customerType === "pj" ? "pj" : "pf",
  );

  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

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
          onBlur={(event) =>
            setEmailSuggestion(suggestEmail(event.target.value))
          }
          // Retyping answers the question; a stale suggestion would not.
          onInput={() => setEmailSuggestion(null)}
        >
          {/* Polite: announced when it appears, without stealing focus. */}
          <p aria-live="polite" className="mt-1 text-sm empty:mt-0">
            {emailSuggestion && (
              <>
                Ai vrut sa scrii{" "}
                <button
                  type="button"
                  onClick={() => {
                    const input = formRef.current?.elements.namedItem("email");
                    if (input instanceof HTMLInputElement) {
                      input.value = emailSuggestion;
                    }
                    setEmailSuggestion(null);
                  }}
                  className="text-primary focus-visible:ring-ring rounded font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
                >
                  {emailSuggestion}
                </button>
                ?
              </>
            )}
          </p>
        </Field>
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
        {/* First, because it decides what the county field below asks for. */}
        <SelectField
          name="country"
          label="Tara"
          autoComplete="country"
          defaultValue={values.country ?? "RO"}
          onChange={(event) => setCountry(event.target.value)}
          error={errors.country}
          className="sm:col-span-2"
        >
          {COUNTRIES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </SelectField>
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
        {country === "RO" ? (
          <SelectField
            // Keyed so switching country swaps the control cleanly rather
            // than carrying a Moldovan region into a Romanian select.
            key="county-ro"
            name="county"
            label="Judet"
            autoComplete="address-level1"
            defaultValue={values.county ?? ""}
            error={errors.county}
          >
            <option value="" disabled>
              Alege judetul
            </option>
            {RO_COUNTIES.map((county) => (
              <option key={county} value={county}>
                {county}
              </option>
            ))}
          </SelectField>
        ) : (
          <Field
            key="county-other"
            name="county"
            label="Judet / regiune (optional)"
            autoComplete="address-level1"
            defaultValue={values.county}
            error={errors.county}
          />
        )}
        <Field
          name="postcode"
          label="Cod postal"
          autoComplete="postal-code"
          inputMode="numeric"
          defaultValue={values.postcode}
          error={errors.postcode}
        />
      </Section>

      <Section title="Facturare">
        <div
          role="radiogroup"
          aria-label="Tip client"
          className="mb-4 grid gap-3 sm:col-span-2 sm:grid-cols-2"
        >
          {CUSTOMER_TYPES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "border-input flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                "has-checked:border-primary has-checked:bg-accent/50",
                "has-focus-visible:ring-ring/30 has-focus-visible:ring-3",
              )}
            >
              <input
                type="radio"
                name="customerType"
                value={option.value}
                defaultChecked={(values.customerType ?? "pf") === option.value}
                onChange={() => setCustomerType(option.value)}
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span>
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </div>

        {customerType === "pj" && (
          <>
            <Field
              name="company"
              label="Nume firma"
              autoComplete="organization"
              defaultValue={values.company}
              error={errors.company}
              className="sm:col-span-2"
            />
            <Field
              name="cui"
              label="CUI"
              autoCapitalize="characters"
              spellCheck={false}
              hint="Cu sau fara RO, de exemplu RO12345678"
              defaultValue={values.cui}
              error={errors.cui}
            />
            <Field
              name="regCom"
              label="Nr. Reg. Com. (optional)"
              autoCapitalize="characters"
              spellCheck={false}
              hint="De exemplu J12/345/2020"
              defaultValue={values.regCom}
              error={errors.regCom}
            />
          </>
        )}
      </Section>

      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="space-y-3">
        {total && (
          <p className="flex items-baseline justify-between px-1">
            <span className="text-muted-foreground text-sm">Total comanda</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatMoney(total)}
            </span>
          </p>
        )}
        <SubmitButton />
        <p className="text-muted-foreground text-center text-xs">
          Nu platesti nimic acum. Te sunam pentru confirmare, apoi livram.
        </p>
      </div>
    </form>
  );
}
