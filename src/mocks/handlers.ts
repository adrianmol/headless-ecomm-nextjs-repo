import { http, HttpResponse } from "msw";
import type { components } from "@/commerce/api";

export const API_BASE = "https://commerce.test/v1";

type Money = components["schemas"]["Money"];
type Cart = components["schemas"]["Cart"];

const ron = (amountMinor: number): Money => ({ amountMinor, currency: "RON" });

/** Romanian standard VAT, in basis points. */
const VAT_RATE = 2100;

export const productFixture: components["schemas"]["Product"] = {
  id: "prod_1",
  slug: "toner-compatibil-hp-35a-black-cb435a",
  title: "Toner compatibil (2K) HP 35A Black (CB435A)",
  description: "Cartus de toner compatibil pentru imprimante HP LaserJet.",
  kind: "toner",
  attributes: {
    color: "black",
    yieldPages: 2000,
    oemCodes: ["CB435A", "35A"],
    manufacturer: "G&G",
    isOriginal: false,
  },
  compatibility: [
    {
      printerBrand: { slug: "hp", name: "HP" },
      printerModels: [{ slug: "laserjet-p1005", name: "LaserJet P1005" }],
    },
  ],
  images: [
    {
      url: "https://cdn.test/1.jpg",
      alt: "Toner compatibil HP 35A",
      width: 800,
      height: 800,
    },
  ],
  variants: [{ id: "var_1", title: "Standard" }],
};

/**
 * Both VAT figures are present because the contract requires both. 3400 gross
 * at 21% is 2810 net — the storefront reads that number, it never computes it.
 */
export const offerFixture: components["schemas"]["Offer"] = {
  variantId: "var_1",
  price: ron(3400),
  priceExVat: ron(2810),
  vatRate: VAT_RATE,
  availability: { inStock: true, quantity: 42 },
};

export const cartFixture: Cart = {
  id: "cart_1",
  version: 3,
  lines: [
    {
      id: "line_1",
      variantId: "var_1",
      title: "Toner compatibil (2K) HP 35A Black (CB435A)",
      quantity: 1,
      unitPrice: ron(3400),
      lineTotal: ron(3400),
    },
  ],
  totals: { subtotal: ron(3400), total: ron(3400) },
};

/** Structured error body matching the spec's Error schema. */
export function errorBody(
  code: string,
  message = "error",
  details?: Record<string, unknown>,
) {
  return { code, message, ...(details ? { details } : {}) };
}

/** Records the Idempotency-Key of every mutating request, for assertions. */
export const idempotencyLog: string[] = [];

export const handlers = [
  http.get(`${API_BASE}/products`, () =>
    HttpResponse.json({
      items: [productFixture],
      nextCursor: null,
      total: 1,
      facets: [
        {
          key: "kind",
          label: "Tip consumabil",
          values: [{ value: "toner", label: "Tonere", count: 1 }],
        },
      ],
    }),
  ),

  http.get(`${API_BASE}/offers`, () =>
    HttpResponse.json({
      items: [{ slug: productFixture.slug, offer: offerFixture }],
    }),
  ),

  http.get(`${API_BASE}/compat/brands`, () =>
    HttpResponse.json({
      items: [{ slug: "hp", name: "HP", productCount: 1 }],
    }),
  ),

  http.get(`${API_BASE}/compat/brands/:brand/models`, () =>
    HttpResponse.json({
      items: [
        { slug: "laserjet-p1005", name: "LaserJet P1005", productCount: 1 },
      ],
    }),
  ),

  http.get(`${API_BASE}/products/:slug`, () =>
    HttpResponse.json(productFixture),
  ),

  http.get(`${API_BASE}/products/:slug/offer`, () =>
    HttpResponse.json(offerFixture),
  ),

  http.get(`${API_BASE}/carts/:cartId`, () => HttpResponse.json(cartFixture)),

  http.post(`${API_BASE}/carts/:cartId/lines`, ({ request }) => {
    idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
    return HttpResponse.json({
      ...cartFixture,
      version: cartFixture.version + 1,
    });
  }),

  http.patch(`${API_BASE}/carts/:cartId/lines/:lineId`, ({ request }) => {
    idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
    return HttpResponse.json({
      ...cartFixture,
      version: cartFixture.version + 1,
    });
  }),

  http.delete(`${API_BASE}/carts/:cartId/lines/:lineId`, ({ request }) => {
    idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
    return HttpResponse.json({
      ...cartFixture,
      lines: [],
      version: cartFixture.version + 1,
    });
  }),

  http.post(`${API_BASE}/carts`, ({ request }) => {
    idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
    return HttpResponse.json(
      { ...cartFixture, lines: [], version: 1 },
      { status: 201 },
    );
  }),
];
