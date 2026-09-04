import { z } from "zod";
import type { Money } from "@/lib/money";
import { moneySchema } from "./schemas";

/**
 * Stable runtime brand that survives duplicated server chunks and cross-realm
 * `Error` constructors, which break `instanceof`. `Symbol.for` gives the same
 * identity across every copy of this module.
 */
const COMMERCE_ERROR_EXCEPTION_BRAND = Symbol.for(
  "headless-ecomm-flow.CommerceErrorException",
);

/**
 * Every backend failure is normalised into this union before it leaves the data
 * layer. The UI switches on `kind` exhaustively and never sees a raw API
 * payload, an HTTP status, or a Zod error.
 */
export type CommerceError =
  /**
   * The resource does not exist. Distinct from `Unavailable` on purpose: a
   * missing product is a 404 the customer should see, while `Unavailable` is a
   * server fault worth alerting on. Collapsing them turns every deleted product
   * into a page that looks broken, and buries real outages in the same bucket.
   */
  | { kind: "NotFound" }
  | { kind: "OutOfStock"; variantId: string | null; available: number }
  | { kind: "PriceChanged"; oldPrice: Money; newPrice: Money }
  | { kind: "CartExpired" }
  | { kind: "Unauthorized" }
  | {
      kind: "ValidationFailed";
      /** Machine-readable field path, e.g. "email". Drives which input to mark. */
      field: string | null;
      /**
       * Backend prose. For logs and developers only — never render this. It is
       * unlocalised, unreviewed, and may name internal fields. The UI maps
       * `field` to its own copy.
       */
      devMessage: string;
    }
  | { kind: "Unavailable"; retryable: boolean };

/** Thrown by read paths. Write paths return errors instead, so forms can render them. */
export class CommerceErrorException extends Error {
  readonly error: CommerceError;
  readonly [COMMERCE_ERROR_EXCEPTION_BRAND] = true;

  constructor(error: CommerceError) {
    super(error.kind);
    this.name = "CommerceErrorException";
    this.error = error;
  }
}

const apiErrorSchema = z.object({
  code: z.enum([
    "not_found",
    "out_of_stock",
    "price_changed",
    "cart_expired",
    "unauthorized",
    "validation_failed",
    "unavailable",
  ]),
  message: z.string(),
  details: z.looseObject({}).optional(),
});

const outOfStockDetails = z.object({
  variantId: z.string().optional(),
  available: z.number().int().nonnegative().optional(),
});

const priceChangedDetails = z.object({
  oldPrice: moneySchema,
  newPrice: moneySchema,
});

const validationFailedDetails = z.object({
  field: z.string().optional(),
});

/**
 * Maps a backend error payload onto the domain union.
 *
 * Dispatch is on the machine-readable `code` only. Never string-match
 * `message`: it is written for developers, gets reworded, and is localised.
 *
 * Anything unrecognised — including a payload that does not match the documented
 * error shape — degrades to `Unavailable`, because an error we cannot classify
 * is an infrastructure fault, not a user-actionable one.
 */
export function normalizeError(
  payload: unknown,
  status?: number,
): CommerceError {
  const parsed = apiErrorSchema.safeParse(payload);

  if (!parsed.success) {
    return { kind: "Unavailable", retryable: isRetryableStatus(status) };
  }

  const { code, message, details } = parsed.data;

  switch (code) {
    case "not_found":
      return { kind: "NotFound" };
    case "out_of_stock": {
      const d = outOfStockDetails.safeParse(details ?? {});
      return {
        kind: "OutOfStock",
        variantId: d.success ? (d.data.variantId ?? null) : null,
        available: d.success ? (d.data.available ?? 0) : 0,
      };
    }
    case "price_changed": {
      const d = priceChangedDetails.safeParse(details ?? {});
      // A price change we cannot read the prices from is unusable: we must not
      // guess, because the customer has to see and accept the new price.
      if (!d.success) return { kind: "Unavailable", retryable: false };
      return {
        kind: "PriceChanged",
        oldPrice: d.data.oldPrice,
        newPrice: d.data.newPrice,
      };
    }
    case "cart_expired":
      return { kind: "CartExpired" };
    case "unauthorized":
      return { kind: "Unauthorized" };
    case "validation_failed": {
      const d = validationFailedDetails.safeParse(details ?? {});
      return {
        kind: "ValidationFailed",
        field: d.success ? (d.data.field ?? null) : null,
        devMessage: message,
      };
    }
    case "unavailable":
      return { kind: "Unavailable", retryable: isRetryableStatus(status) };
  }
}

function isRetryableStatus(status?: number): boolean {
  if (status === undefined) return false;
  return status === 429 || status >= 500;
}

/** A response body that failed schema validation is an infrastructure fault. */
export function schemaViolation(): CommerceError {
  return { kind: "Unavailable", retryable: false };
}

function isMoney(
  value: unknown,
): value is { amountMinor: number; currency: string } {
  return moneySchema.safeParse(value).success;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the complete known discriminated `CommerceError` union.
 */
function isCommerceError(value: unknown): value is CommerceError {
  if (!isPlainObject(value)) return false;
  const { kind, ...rest } = value;
  if (typeof kind !== "string") return false;

  switch (kind) {
    case "NotFound":
      return true;
    case "OutOfStock": {
      const { variantId, available } = rest;
      return (
        (typeof variantId === "string" || variantId === null) &&
        typeof available === "number" &&
        Number.isInteger(available) &&
        available >= 0
      );
    }
    case "PriceChanged": {
      const { oldPrice, newPrice } = rest;
      return isMoney(oldPrice) && isMoney(newPrice);
    }
    case "CartExpired":
    case "Unauthorized":
      return true;
    case "ValidationFailed": {
      const { field, devMessage } = rest;
      return (
        (typeof field === "string" || field === null) &&
        typeof devMessage === "string"
      );
    }
    case "Unavailable": {
      const { retryable } = rest;
      return typeof retryable === "boolean";
    }
    default:
      return false;
  }
}

/**
 * Runtime-validated guard for `CommerceErrorException`.
 *
 * Uses a stable module-level brand instead of `instanceof` because thrown
 * values can cross bundle chunk boundaries where duplicated `Error` and
 * `CommerceErrorException` constructors no longer share identity.
 */
export function isCommerceErrorException(
  error: unknown,
): error is CommerceErrorException {
  if (typeof error !== "object" || error === null) return false;

  const brandedError = error as Record<symbol, unknown>;
  if (brandedError[COMMERCE_ERROR_EXCEPTION_BRAND] !== true) return false;

  if (
    (error as { name?: unknown }).name !== "CommerceErrorException" ||
    typeof (error as { message?: unknown }).message !== "string"
  ) {
    return false;
  }

  return isCommerceError((error as { error?: unknown }).error);
}
