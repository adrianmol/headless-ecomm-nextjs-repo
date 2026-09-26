import { z } from "zod";

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
  email: z.email("Introdu o adresa de email valida"),
  name: z.string().trim().min(1, "Introdu numele"),
  // Loose on purpose: orders are confirmed by phone, so it must be present, but
  // format rules reject real numbers (spaces, +40, landlines) more than typos.
  phone: z.string().trim().min(6, "Introdu numarul de telefon").max(32),
  line1: z.string().trim().min(1, "Introdu adresa"),
  city: z.string().trim().min(1, "Introdu orasul"),
  postcode: z.string().trim().min(1, "Introdu codul postal"),
  country: z.string().trim().length(2, "Alege tara"),
});

/** First message per field, in the shape the form renders. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[String(issue.path[0])] ??= issue.message;
  }
  return errors;
}
