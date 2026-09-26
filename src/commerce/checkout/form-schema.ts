import { z } from "zod";
import { isRoCounty } from "@/lib/ro-counties";

/**
 * Client-side shape checking for UX only. The backend re-validates and is the
 * enforcement point; nothing here is a control. Kept deliberately loose —
 * over-strict address rules reject legitimate customers, and the payment
 * provider and carrier both validate properly downstream.
 *
 * Its own module because a `"use server"` file may only export async functions,
 * and both checkout actions need it.
 */
export const checkoutSchema = z.object({
  email: z.email("Introdu o adresa de email valida").max(254),
  name: z.string().trim().min(1, "Introdu numele").max(100),
  // Loose on purpose: orders are confirmed by phone, so it must be present, but
  // format rules reject real numbers (spaces, +40, landlines) more than typos.
  phone: z.string().trim().min(6, "Introdu numarul de telefon").max(32),
  line1: z.string().trim().min(1, "Introdu adresa").max(200),
  city: z.string().trim().min(1, "Introdu orasul").max(100),
  postcode: z.string().trim().min(1, "Introdu codul postal").max(20),
  country: z
    .string()
    .trim()
    .length(2, "Alege tara")
    .transform((code) => code.toUpperCase()),
  // Required for Romania, checked in `parseCheckout`; free text elsewhere.
  county: z.string().trim().max(60).default(""),
  // pf = persoana fizica, pj = persoana juridica (invoice to a company).
  customerType: z.enum(["pf", "pj"]).default("pf"),
  company: z.string().trim().max(100).default(""),
  // Spaces dropped and upper-cased, so "ro 123 456" and "RO123456" match.
  cui: z
    .string()
    .max(20)
    .default("")
    .transform((value) => value.replace(/\s+/g, "").toUpperCase()),
  regCom: z.string().trim().max(30).default(""),
});

export type CheckoutData = z.infer<typeof checkoutSchema>;

/**
 * Format only — optional RO prefix, 2 to 10 digits — and no checksum. The
 * control-digit algorithm is well defined, but a false rejection costs a B2B
 * order while a typo costs one phone call, which the shop makes anyway.
 */
const CUI_PATTERN = /^(RO)?\d{2,10}$/;

/**
 * The rules that depend on more than one field.
 *
 * Checked on the raw input, beside the schema rather than as a refinement of
 * it: Zod skips an object's refinements while any field has an issue, so a
 * missing county would only be reported on the *second* submit, after the
 * email typo was fixed. Here every error shows at once.
 */
function crossFieldErrors(input: Record<string, unknown>) {
  const text = (key: string) =>
    typeof input[key] === "string" ? (input[key] as string).trim() : "";
  const errors: Record<string, string> = {};

  if (text("country").toUpperCase() === "RO" && !isRoCounty(text("county"))) {
    errors.county = "Alege judetul";
  }
  if (text("customerType") === "pj") {
    if (!text("company")) errors.company = "Introdu numele firmei";
    if (!CUI_PATTERN.test(text("cui").replace(/\s+/g, "").toUpperCase())) {
      errors.cui = "Introdu un CUI valid, de exemplu RO12345678";
    }
  }
  return errors;
}

/** Schema plus cross-field rules, with every field's first error at once. */
export function parseCheckout(
  input: Record<string, unknown>,
):
  | { success: true; data: CheckoutData }
  | { success: false; fieldErrors: Record<string, string> } {
  const parsed = checkoutSchema.safeParse(input);
  const errors = {
    ...crossFieldErrors(input),
    ...(parsed.success ? {} : fieldErrors(parsed.error)),
  };
  if (!parsed.success || Object.keys(errors).length > 0) {
    return { success: false, fieldErrors: errors };
  }
  return { success: true, data: parsed.data };
}

/** First message per field, in the shape the form renders. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[String(issue.path[0])] ??= issue.message;
  }
  return errors;
}

/**
 * The customer's own input, for re-filling the form after a failed submit.
 * Only the schema's fields, so server-minted hidden values are never echoed.
 */
export function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of Object.keys(checkoutSchema.shape)) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value.slice(0, 200);
  }
  return values;
}
