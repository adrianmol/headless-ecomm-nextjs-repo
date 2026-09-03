import { http, HttpResponse } from "msw";
import type { components } from "@/commerce/api";

export const API_BASE = "https://commerce.test/v1";

type Money = components["schemas"]["Money"];
type Cart = components["schemas"]["Cart"];

const eur = (amountMinor: number): Money => ({ amountMinor, currency: "EUR" });

export const productFixture: components["schemas"]["Product"] = {
  id: "prod_1",
  slug: "merino-crew",
  title: "Merino Crew",
  description: "A jumper.",
  images: [
    { url: "https://cdn.test/1.jpg", alt: "Merino Crew", width: 800, height: 1000 },
  ],
  variants: [{ id: "var_1", title: "M" }],
};

export const offerFixture: components["schemas"]["Offer"] = {
  variantId: "var_1",
  price: eur(8900),
  availability: { inStock: true, quantity: 4 },
};

export const cartFixture: Cart = {
  id: "cart_1",
  version: 3,
  lines: [
    {
      id: "line_1",
      variantId: "var_1",
      title: "Merino Crew",
      quantity: 1,
      unitPrice: eur(8900),
      lineTotal: eur(8900),
    },
  ],
  totals: { subtotal: eur(8900), total: eur(8900) },
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
    HttpResponse.json({ items: [productFixture], nextCursor: null }),
  ),

  http.get(`${API_BASE}/products/:slug`, () => HttpResponse.json(productFixture)),

  http.get(`${API_BASE}/products/:slug/offer`, () =>
    HttpResponse.json(offerFixture),
  ),

  http.get(`${API_BASE}/carts/:cartId`, () => HttpResponse.json(cartFixture)),

  http.post(`${API_BASE}/carts/:cartId/lines`, ({ request }) => {
    idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
    return HttpResponse.json({ ...cartFixture, version: cartFixture.version + 1 });
  }),

  http.patch(`${API_BASE}/carts/:cartId/lines/:lineId`, ({ request }) => {
    idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
    return HttpResponse.json({ ...cartFixture, version: cartFixture.version + 1 });
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
    return HttpResponse.json({ ...cartFixture, lines: [], version: 1 }, { status: 201 });
  }),
];
