import { LOCALE } from "./locale";

/**
 * Money is an integer count of minor units plus a currency code.
 *
 * Never represent money as a float. Binary floating point cannot exactly
 * represent most decimal fractions (0.1 + 0.2 !== 0.3), and the accumulated
 * error lands on a customer's invoice. All arithmetic here stays in integers.
 */
export type Money = {
  amountMinor: number;
  currency: string;
};

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} and ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

/**
 * Minor-unit exponent for a currency: 2 for EUR/USD, 0 for JPY, 3 for KWD.
 * Derived from Intl rather than a hardcoded table so it stays correct.
 *
 * Exported because an upstream feed that quotes prices in major units has to
 * scale by exactly this factor, and a second hardcoded `* 100` elsewhere would
 * be wrong for JPY and KWD without anything failing loudly.
 */
export function minorUnitExponent(currency: string, locale: string): number {
  const resolved = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).resolvedOptions();
  return resolved.maximumFractionDigits ?? 2;
}

export function zeroMoney(currency: string): Money {
  return { amountMinor: 0, currency };
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

/**
 * How much off, as a whole percentage, or `null` when there is no real discount.
 *
 * Display only. It never produces a Money value and nothing is charged from it —
 * which is what separates it from `multiplyMoney`'s refusal to take a fractional
 * multiplier. A percentage *label* is safe to compute here; a discounted *total*
 * is not, and still belongs to the backend.
 *
 * Shared rather than inlined at each call site because the listing card badge and
 * the product page both show this figure. Computed twice, they could disagree
 * with each other while both looking plausible — and a shopper comparing the two
 * has no way to know which is wrong.
 *
 * **Rounds down.** A 9.6% reduction shown as "-10%" overstates the saving, and
 * overstating is the direction that attracts a consumer-protection complaint
 * rather than a shrug.
 */
export function discountPercent(
  price: Money,
  compareAtPrice: Money | undefined | null,
): number | null {
  if (!compareAtPrice) return null;
  // Not an error: mixed currencies mean the two figures are not comparable, and
  // a percentage across them would be meaningless rather than merely wrong.
  if (compareAtPrice.currency !== price.currency) return null;
  if (compareAtPrice.amountMinor <= 0) return null;
  if (compareAtPrice.amountMinor <= price.amountMinor) return null;

  const percent = Math.floor(
    ((compareAtPrice.amountMinor - price.amountMinor) /
      compareAtPrice.amountMinor) *
      100,
  );

  // Below 1% there is nothing worth announcing, and "-0%" reads as a bug.
  return percent >= 1 ? percent : null;
}

/**
 * Multiplication is by an integer quantity only. A fractional multiplier (tax
 * rate, percentage discount) requires an explicit rounding policy, which is a
 * backend concern: the storefront must never invent a rounded total.
 */
export function multiplyMoney(money: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(
      `multiplyMoney expects an integer quantity, received ${quantity}. ` +
        "Fractional multipliers need a rounding policy and belong on the backend.",
    );
  }
  return {
    amountMinor: money.amountMinor * quantity,
    currency: money.currency,
  };
}

export function sumMoney(items: readonly Money[], currency: string): Money {
  return items.reduce<Money>(
    (acc, item) => addMoney(acc, item),
    zeroMoney(currency),
  );
}

/**
 * Display only. Dividing by the minor-unit factor produces a float, which is
 * safe here because the value is immediately formatted and never fed back into
 * arithmetic.
 *
 * The default locale is the storefront's, not `en-US`. This is a single-locale
 * shop, and an omitted argument used to render `RON 34.00` instead of
 * `34,00 RON` — silently, on the cart, the checkout summary and the order
 * confirmation. Defaulting to the storefront locale makes the correct output
 * the one you get by forgetting; pass `locale` explicitly to override.
 */
export function formatMoney(money: Money, locale = LOCALE): string {
  const exponent = minorUnitExponent(money.currency, locale);
  const major = money.amountMinor / 10 ** exponent;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(major);
}
