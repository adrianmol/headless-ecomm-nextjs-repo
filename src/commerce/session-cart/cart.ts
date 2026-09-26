import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { multiplyMoney, sumMoney, type Money } from "@/lib/money";
import {
  getHubLiveOffers,
  getHubProduct,
  type HubLiveResult,
} from "../hub/queries";
import { moneySchema } from "../schemas";

/**
 * A cart held in the visitor's own cookie, for HUB products.
 *
 * Exists because neither backend has a cart: HUB exposes catalogue reads only,
 * and the commerce API the `cart/` module talks to is not deployed. This is the
 * stopgap until one of them grows cart endpoints — at that point this module is
 * deleted, not migrated, because the backend owns the cart (ADR-0002).
 *
 * **The cookie never holds a price.** It holds skus and quantities (plus a name
 * for display), and every read re-prices through `getHubLiveOffers`, which is
 * never cached. A customer can edit their own cookie; if the price lived there,
 * they could edit what they pay.
 */

const CART_COOKIE = "hub_cart";
const ORDER_COOKIE = "hub_order";

/*
  ponytail: capped so both cookies stay under the 4 KB browser limit — a cookie
  over it is silently dropped, which would empty the basket with no error. A real
  cart backend removes the ceiling.
*/
export const MAX_LINES = 10;
export const MAX_QUANTITY = 99;
const MAX_NAME = 80;

/** Same attributes as src/commerce/session.ts; `Lax` survives a PSP return. */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

const storedLineSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().max(MAX_NAME),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});

export type StoredLine = z.infer<typeof storedLineSchema>;

const storedCartSchema = z.array(storedLineSchema).max(MAX_LINES);

export type PricedLine = StoredLine & {
  unitPrice: Money;
  lineTotal: Money;
  /** Upper bound for the stepper: known stock, else the per-line cap. */
  maxQuantity: number;
};

export type PricedCart = {
  lines: PricedLine[];
  /** Lines that can no longer be bought, dropped from the priced cart. */
  unavailable: StoredLine[];
  total: Money | null;
};

// base64url rather than raw JSON: Next percent-encodes cookie values, and
// quotes and braces triple in size, which the size budget above cannot afford.
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function decode<T extends z.ZodType>(schema: T, raw: string | undefined) {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString()),
    );
    return parsed.success ? (parsed.data as z.infer<T>) : null;
  } catch {
    return null;
  }
}

/** A malformed or tampered cookie reads as an empty cart, never an error page. */
export async function readCartLines(): Promise<StoredLine[]> {
  const store = await cookies();
  return decode(storedCartSchema, store.get(CART_COOKIE)?.value) ?? [];
}

/** Server Actions only: cookies cannot be written during render. */
export async function writeCartLines(lines: StoredLine[]): Promise<void> {
  const store = await cookies();
  if (lines.length === 0) {
    store.delete(CART_COOKIE);
    return;
  }
  store.set(CART_COOKIE, encode(lines), {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function toStoredLine(sku: string, name: string, quantity: number) {
  return { sku, name: name.slice(0, MAX_NAME), quantity };
}

/**
 * Pure, so the money path is testable without HUB. A line is kept only when
 * HUB returned it, lets it be ordered, and shows a price — a hidden price
 * (`show: false`) cannot be charged either, since the customer never saw it.
 */
export function priceLines(
  lines: readonly StoredLine[],
  live: HubLiveResult,
): PricedCart {
  const bySku = new Map(live.entries.map((entry) => [entry.sku, entry]));
  const priced: PricedLine[] = [];
  const unavailable: StoredLine[] = [];

  for (const line of lines) {
    const entry = bySku.get(line.sku);
    const unitPrice = entry?.offer.promoPrice ?? entry?.offer.price;
    if (
      !entry ||
      !unitPrice ||
      !entry.offer.displayable ||
      !entry.stock.orderable
    ) {
      unavailable.push(line);
      continue;
    }
    priced.push({
      ...line,
      unitPrice,
      lineTotal: multiplyMoney(unitPrice, line.quantity),
      maxQuantity: Math.min(entry.stock.quantity ?? MAX_QUANTITY, MAX_QUANTITY),
    });
  }

  const total =
    priced.length === 0
      ? null
      : sumMoney(
          priced.map((line) => line.lineTotal),
          priced[0].unitPrice.currency,
        );

  return { lines: priced, unavailable, total };
}

/** Uncached by construction: `getHubLiveOffers` must never be cached. */
export async function priceCart(
  lines: readonly StoredLine[],
): Promise<PricedCart> {
  if (lines.length === 0) return { lines: [], unavailable: [], total: null };
  return priceLines(
    lines,
    await getHubLiveOffers({ skus: lines.map((line) => line.sku) }),
  );
}

/**
 * Catalogue details for basket and order lines, sku → name and image.
 *
 * Not from the cookie (no room under its size cap) and not from the live
 * endpoint (which returns neither). `getHubProduct` is the cached, sessionless
 * catalog read, already warm from the add-to-cart that put the line here, so
 * this costs no upstream call in the usual case. Display only: a failed lookup
 * yields no thumbnail and the caller's fallback name, never a broken page.
 */
export async function lineCatalog(
  skus: readonly string[],
): Promise<Map<string, { name: string | null; imageUrl: string | null }>> {
  const results = await Promise.allSettled(
    skus.map((sku) => getHubProduct({ by: "sku", value: sku })),
  );
  return new Map(
    skus.map((sku, i) => {
      const result = results[i];
      const product = result.status === "fulfilled" ? result.value : null;
      return [
        sku,
        { name: product?.name ?? null, imageUrl: product?.imageUrl ?? null },
      ];
    }),
  );
}

const orderSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  /**
   * Present only for an invoice to a company. Optional in the schema so an
   * order cookie written before this field existed still reads.
   */
  billing: z
    .object({
      company: z.string(),
      cui: z.string(),
      regCom: z.string(),
    })
    .optional(),
  /** Whether the customer's own confirmation email went out. */
  confirmationSent: z.boolean().optional(),
  lines: z.array(
    z.object({
      sku: z.string(),
      /**
       * Optional: the cookie copy drops it to fit the size cap, and the page
       * looks it up from the catalogue. Cookies written before that still
       * carry it, and it is present on the in-memory order the email uses.
       */
      name: z.string().optional(),
      quantity: z.number().int(),
      lineTotal: moneySchema,
    }),
  ),
  total: moneySchema,
});

export type SessionOrder = z.infer<typeof orderSchema>;

/**
 * The last order placed in this browser. Display only: it is the customer's own
 * cookie, so nothing downstream may treat it as a record of what was charged.
 */
export async function readLastOrder(): Promise<SessionOrder | null> {
  const store = await cookies();
  return decode(orderSchema, store.get(ORDER_COOKIE)?.value);
}

/**
 * Stores a display copy, trimmed to fit the cookie's 4 KB ceiling.
 *
 * The full order went to the shop by email before this runs; the cookie only
 * feeds the confirmation page. So it may lose detail, but it must not lose the
 * cookie: over 4 KB a browser drops it silently, and a customer who just
 * ordered is told the order does not exist. Product names are the bulk of
 * it, so they go, and the page reads them from the catalogue instead. The
 * size is covered by a worst-case test in cart.test.ts.
 */
export async function writeLastOrder(order: SessionOrder): Promise<void> {
  const clip = (value: string, max: number) => value.slice(0, max);
  const display: SessionOrder = {
    ...order,
    name: clip(order.name, 60),
    address: clip(order.address, 150),
    billing: order.billing && {
      company: clip(order.billing.company, 60),
      cui: clip(order.billing.cui, 20),
      regCom: clip(order.billing.regCom, 30),
    },
    lines: order.lines.map(({ sku, quantity, lineTotal }) => ({
      sku,
      quantity,
      lineTotal,
    })),
  };

  const store = await cookies();
  store.set(ORDER_COOKIE, encode(display), {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 7,
  });
}
