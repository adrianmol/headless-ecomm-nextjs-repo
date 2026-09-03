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
 */
function minorUnitExponent(currency: string, locale: string): number {
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
 */
export function formatMoney(money: Money, locale = "en-US"): string {
  const exponent = minorUnitExponent(money.currency, locale);
  const major = money.amountMinor / 10 ** exponent;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(major);
}
