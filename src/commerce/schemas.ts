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

/**
 * A quantity break. `minQuantity` starts at 2: a "tier" of one is just the
 * unit price, and admitting 1 here would let a malformed feed render a
 * duplicate, contradictory headline price.
 */
export const priceTierSchema = z.object({
  minQuantity: z.number().int().min(2),
  unitPrice: moneySchema,
  unitPriceExVat: moneySchema.optional(),
});

/**
 * Validated because every field here is charged or invoiced.
 *
 * `priceExVat` is required and comes from the backend. It is deliberately not
 * derived from `price` and `vatRate` — see openapi/commerce.yaml `Offer` and
 * ADR-0004. `vatRate` is carried for display and invoicing only.
 *
 * `priceTiers` is sorted here rather than trusted: the contract says ascending,
 * but a tier table rendered out of order reads as a price *rise* for buying
 * more, and sorting is cheaper than the support ticket.
 */
export const offerSchema = z.object({
  variantId: z.string(),
  price: moneySchema,
  priceExVat: moneySchema,
  vatRate: z.number().int().nonnegative(),
  compareAtPrice: moneySchema.optional(),
  priceTiers: z
    .array(priceTierSchema)
    .optional()
    .transform((tiers) =>
      tiers ? [...tiers].sort((a, b) => a.minQuantity - b.minQuantity) : tiers,
    ),
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
