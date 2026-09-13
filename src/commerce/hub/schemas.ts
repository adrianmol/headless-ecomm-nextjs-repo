import "server-only";
import { z } from "zod";
import { minorUnitExponent, type Money } from "@/lib/money";
import { LOCALE } from "@/lib/locale";

/**
 * Runtime boundary for the HUB catalog API.
 *
 * Validation here is selective, per ADR-0003: money, stock and identifiers are
 * validated because being silently wrong about them is materially harmful;
 * names, descriptions and meta text are not, because blanket validation costs
 * real CPU on the hottest read path and gets switched off under load.
 *
 * Field names are Romanian because the contract says names are the contract —
 * they may be added to, never renamed. So they are mapped to the storefront's
 * own vocabulary exactly once, here, rather than leaking upstream naming into
 * every component.
 */

/**
 * HUB sends money as a **major-unit JSON number** — `"valoare": 66` meaning
 * 66 RON — while this codebase's rule is that money is an integer count of minor
 * units. This is the conversion, and it is the only place it happens.
 *
 * Sampled 200 live products on 2026-09-13: every price was a whole number, RON,
 * between 6 and 2090, none fractional. That does **not** justify trusting the
 * feed — one `66.50` would otherwise pass straight through into arithmetic — so
 * the value is bounded and rounded rather than assumed integral.
 *
 * `Math.round(value * 100)` rather than `value * 100`: the multiplication is
 * float arithmetic, so 66.7 * 100 is 6670.000000000001. Rounding at the boundary
 * is what keeps every later operation in integers.
 *
 * Prices are VAT-inclusive (`cu_tva: true`). Nothing here strips VAT — a
 * VAT-exclusive display would need the rate, which the contract does not supply.
 */
const MAX_MINOR_UNITS = 100_000_000; // 1,000,000 RON — implausible, so a signal.

/**
 * Decimal places in a JSON number, from its shortest round-trip representation.
 *
 * Returns `null` for exponential notation. `1e-7` has no readable decimal count
 * and is not a price; treating it as 0 decimals would round it to zero minor
 * units, i.e. silently free.
 */
function decimalPlaces(value: number): number | null {
  const text = String(value);
  if (text.includes("e") || text.includes("E")) return null;
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * Scales by the currency's own exponent, not a hardcoded 100.
 *
 * `* 100` was the first version and it is wrong for JPY (0 minor digits) and KWD
 * (3). `moneda` is a contract field, so another currency is possible, and the
 * error would be a silent factor-of-100 on every price rather than a crash.
 */
const majorUnitsToMoney = (value: number, currency: string): Money => {
  const factor = 10 ** minorUnitExponent(currency, LOCALE);
  return { amountMinor: Math.round(value * factor), currency };
};

/**
 * A price carrying more decimals than its currency has minor digits is a feed
 * error, and is rejected rather than rounded.
 *
 * Rounding it would be both lossy and *unpredictably* lossy: `1.005 * 100` is
 * `100.49999999999999` in binary floating point, so `Math.round` yields 100, not
 * the 101 a human would expect. The nearest double to 1.005 is genuinely below
 * it, so there is no way to recover the intended value — which makes rejecting
 * the input the only honest option. Sampled live data was entirely whole-number
 * RON, so this rejects nothing that currently exists.
 */
const priceValue = z
  .number()
  .finite()
  .nonnegative()
  .superRefine((value, ctx) => {
    const places = decimalPlaces(value);
    if (places === null) {
      ctx.addIssue({
        code: "custom",
        message: "price in exponential notation",
      });
      return;
    }
    // Currency is validated on the same object, but not available here, so the
    // widest plausible precision is used and the per-currency check happens in
    // `hubPriceSchema` below.
    if (places > 3) {
      ctx.addIssue({ code: "custom", message: "price has too many decimals" });
    }
    if (Math.round(value * 1000) > MAX_MINOR_UNITS * 10) {
      ctx.addIssue({ code: "custom", message: "price implausibly large" });
    }
  });

export const hubPriceSchema = z
  .object({
    valoare: priceValue.nullable(),
    promo: priceValue.nullable().optional(),
    moneda: z.string().min(3),
    cu_tva: z.boolean(),
    se_arata: z.boolean(),
  })
  .superRefine((raw, ctx) => {
    // Now that the currency is known, hold each price to that currency's
    // precision: 2 decimals for RON, 0 for JPY, 3 for KWD.
    const allowed = minorUnitExponent(raw.moneda, LOCALE);
    for (const [field, value] of [
      ["valoare", raw.valoare],
      ["promo", raw.promo ?? null],
    ] as const) {
      if (value === null) continue;
      const places = decimalPlaces(value);
      if (places !== null && places > allowed) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${raw.moneda} has ${allowed} minor digits, price has ${places}`,
        });
      }
      if (Math.round(value * 10 ** allowed) > MAX_MINOR_UNITS) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "price implausibly large",
        });
      }
    }
  });

export type HubOffer = {
  /** Null when the feed has no price, which is distinct from a price of zero. */
  price: Money | null;
  /** Only ever a real reduction; the contract sends null otherwise. */
  promoPrice: Money | null;
  vatIncluded: boolean;
  /** `se_arata: false` means the price exists but must not be displayed. */
  displayable: boolean;
};

export function toOffer(raw: z.infer<typeof hubPriceSchema>): HubOffer {
  return {
    price:
      raw.valoare === null ? null : majorUnitsToMoney(raw.valoare, raw.moneda),
    promoPrice:
      raw.promo === null || raw.promo === undefined
        ? null
        : majorUnitsToMoney(raw.promo, raw.moneda),
    vatIncluded: raw.cu_tva,
    displayable: raw.se_arata,
  };
}

/**
 * Observed live: `stoc`, `limitat`, `furnizor`, `nostoc`. The contract also
 * documents `soon`. Anything unrecognised degrades to `unknown` rather than
 * failing the parse — a new state added upstream is explicitly allowed by the
 * contract, and must not take a product page down.
 */
export const HUB_STOCK_STATES = [
  "stoc",
  "limitat",
  "furnizor",
  "nostoc",
  "soon",
] as const;

export const hubStockSchema = z.object({
  stare: z.string(),
  eticheta: z.string(),
  se_comanda: z.boolean(),
  cantitate: z.number().int().nonnegative().nullable().optional(),
});

export type HubStock = {
  state: (typeof HUB_STOCK_STATES)[number] | "unknown";
  /** Upstream's display label. Romanian, and the contract's to own. */
  label: string;
  orderable: boolean;
  quantity: number | null;
};

export function toStock(raw: z.infer<typeof hubStockSchema>): HubStock {
  const known = (HUB_STOCK_STATES as readonly string[]).includes(raw.stare);
  return {
    state: known ? (raw.stare as HubStock["state"]) : "unknown",
    label: raw.eticheta,
    orderable: raw.se_comanda,
    quantity: raw.cantitate ?? null,
  };
}

const metaSchema = z
  .object({ titlu: z.string().default(""), descriere: z.string().default("") })
  .partial()
  .default({});

/** Short product form, as it appears in listings. */
export const hubProductSummarySchema = z.object({
  id: z.number().int(),
  sku: z.string().min(1),
  url: z.string(),
  nume: z.string(),
  brand: z.string().default(""),
  producator: z.string().default(""),
  tip: z.string().default(""),
  pachet: z.boolean().default(false),
  pret: hubPriceSchema,
  stoc: hubStockSchema,
  imagine: z.string().nullable().default(null),
  meta: metaSchema,
});

export type HubProductSummary = {
  id: number;
  /** The stable key, per the contract. Prefer this over `id` for our own links. */
  sku: string;
  slug: string;
  name: string;
  /** Equipment brand, e.g. HP. */
  brand: string;
  /** Commercial mark, e.g. Original / G&G. */
  manufacturer: string;
  type: string;
  isBundle: boolean;
  offer: HubOffer;
  stock: HubStock;
  imageUrl: string | null;
  metaTitle: string;
  metaDescription: string;
};

export function toProductSummary(
  raw: z.infer<typeof hubProductSummarySchema>,
): HubProductSummary {
  return {
    id: raw.id,
    sku: raw.sku,
    slug: raw.url,
    name: raw.nume,
    brand: raw.brand,
    manufacturer: raw.producator,
    type: raw.tip,
    isBundle: raw.pachet,
    offer: toOffer(raw.pret),
    stock: toStock(raw.stoc),
    imageUrl: raw.imagine,
    metaTitle: raw.meta?.titlu ?? "",
    metaDescription: raw.meta?.descriere ?? "",
  };
}

/**
 * `caracteristici` is a **list**, not a map, and must stay one: the contract
 * points out that the same key legitimately repeats — "Compatibil OEM" has dozens
 * of values — so keying by name would silently keep only the last.
 */
export const hubSpecSchema = z.object({
  nume: z.string(),
  valoare: z.string(),
});

export const hubProductDetailSchema = hubProductSummarySchema.extend({
  cod_oferta: z.string().default(""),
  familie: z.string().default(""),
  capacitate: z.string().default(""),
  culoare: z.string().default(""),
  ean: z.string().default(""),
  oem: z.string().default(""),
  descriere: z.string().default(""),
  sumar: z.string().default(""),
  caracteristici: z.array(hubSpecSchema).default([]),
  categorii: z.array(z.number().int()).default([]),
  componente: z.array(hubProductSummarySchema).optional(),
  variante: z.array(hubProductSummarySchema).optional(),
});

export type HubProductDetail = HubProductSummary & {
  offerCode: string;
  family: string;
  capacity: string;
  colour: string;
  ean: string;
  /** Raw OEM compatibility codes, unstructured by the contract's own admission. */
  oem: string;
  /**
   * **HTML from upstream.** Never render this with `dangerouslySetInnerHTML`
   * without sanitising: the project rule is that backend prose is not rendered
   * as markup. Carried through so a decision can be made at the render edge, not
   * silently dropped here.
   */
  descriptionHtml: string;
  summary: string;
  specs: ReadonlyArray<{ name: string; value: string }>;
  categoryIds: readonly number[];
  bundleContents: readonly HubProductSummary[] | null;
  variants: readonly HubProductSummary[] | null;
};

export function toProductDetail(
  raw: z.infer<typeof hubProductDetailSchema>,
): HubProductDetail {
  return {
    ...toProductSummary(raw),
    offerCode: raw.cod_oferta,
    family: raw.familie,
    capacity: raw.capacitate,
    colour: raw.culoare,
    ean: raw.ean,
    oem: raw.oem,
    descriptionHtml: raw.descriere,
    summary: raw.sumar,
    specs: raw.caracteristici.map((s) => ({ name: s.nume, value: s.valoare })),
    categoryIds: raw.categorii,
    bundleContents: raw.componente?.map(toProductSummary) ?? null,
    variants: raw.variante?.map(toProductSummary) ?? null,
  };
}

export const HUB_CATEGORY_KINDS = ["brand", "family", "prn"] as const;

export const hubCategorySchema = z.object({
  id: z.number().int(),
  parinte: z.number().int(),
  nume: z.string(),
  url: z.string().default(""),
  fel: z.string().default(""),
  titlu: z.string().default(""),
  imagine: z.string().nullable().default(null),
  meta: metaSchema,
  /**
   * Present only when counting was requested. The contract is explicit that
   * absent is not zero — a client hiding empty categories would otherwise hide
   * the entire tree — so this stays `undefined`, never defaulted to 0.
   */
  produse: z.number().int().nonnegative().optional(),
});

export type HubCategory = {
  id: number;
  /** 0 means root. */
  parentId: number;
  name: string;
  /** Empty for every category in the live feed as of 2026-09-13. */
  slug: string;
  kind: (typeof HUB_CATEGORY_KINDS)[number] | "unknown";
  title: string;
  imageUrl: string | null;
  metaTitle: string;
  metaDescription: string;
  /** `null` means "not counted", which is not the same as zero. */
  productCount: number | null;
};

export function toCategory(
  raw: z.infer<typeof hubCategorySchema>,
): HubCategory {
  const known = (HUB_CATEGORY_KINDS as readonly string[]).includes(raw.fel);
  return {
    id: raw.id,
    parentId: raw.parinte,
    name: raw.nume,
    slug: raw.url,
    kind: known ? (raw.fel as HubCategory["kind"]) : "unknown",
    title: raw.titlu,
    imageUrl: raw.imagine,
    metaTitle: raw.meta?.titlu ?? "",
    metaDescription: raw.meta?.descriere ?? "",
    // `?? null` and not `?? 0`: absent means "not counted", and the contract
    // warns that treating it as zero would hide the whole tree.
    productCount: raw.produse ?? null,
  };
}

export const hubPaginationSchema = z.object({
  pagina: z.number().int().positive(),
  pe_pagina: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pagini: z.number().int().nonnegative(),
});

export type HubPagination = {
  page: number;
  perPage: number;
  total: number;
  pages: number;
};

export function toPagination(
  raw: z.infer<typeof hubPaginationSchema>,
): HubPagination {
  return {
    page: raw.pagina,
    perPage: raw.pe_pagina,
    total: raw.total,
    pages: raw.pagini,
  };
}
