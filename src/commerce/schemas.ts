import { z } from "zod";

/**
 * Selective runtime validation (ADR-0003).
 *
 * Generated OpenAPI types are a compile-time claim about the backend, not a
 * runtime guarantee. These schemas cover only the fields where being silently
 * wrong is materially harmful: money, stock, and order state.
 *
 * Deliberately NOT validated: titles, descriptions, marketing copy, alt text.
 * Validating those costs real CPU on the hottest read paths for a cosmetic
 * failure mode, and blanket validation is what gets switched off under load —
 * taking the protection on the fields that mattered with it.
 */

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

export const availabilitySchema = z.object({
  inStock: z.boolean(),
  quantity: z.number().int().nonnegative(),
});

export const offerSchema = z.object({
  variantId: z.string(),
  price: moneySchema,
  compareAtPrice: moneySchema.optional(),
  availability: availabilitySchema,
});

export const cartTotalsSchema = z.object({
  subtotal: moneySchema,
  shipping: moneySchema.optional(),
  tax: moneySchema.optional(),
  total: moneySchema,
});

export const cartLineMoneySchema = z.object({
  id: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: moneySchema,
  lineTotal: moneySchema,
});

export const orderStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "cancelled",
]);

export const orderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  total: moneySchema,
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
