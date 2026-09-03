import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import {
  API_BASE,
  cartFixture,
  errorBody,
  idempotencyLog,
} from "@/mocks/handlers";
import { __setCookie } from "@/test/stubs/next-headers";
import { SESSION_COOKIE } from "../session";
import {
  addCartLine,
  createCart,
  removeCartLine,
  updateCartLineQuantity,
} from "./mutations";
import { getCart } from "./queries";

const input = {
  cartId: "cart_1",
  cartVersion: 3,
  variantId: "var_1",
  quantity: 1,
};

describe("addCartLine", () => {
  it("returns the updated cart on success", async () => {
    const result = await addCartLine(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.version).toBe(4);
  });

  it("sends a deterministic Idempotency-Key", async () => {
    await addCartLine(input);
    await addCartLine(input);

    expect(idempotencyLog).toHaveLength(2);
    expect(idempotencyLog[0]).toBe(idempotencyLog[1]);
    expect(idempotencyLog[0]).not.toBe("<missing>");
  });

  it("sends a different key once the cart version has moved", async () => {
    await addCartLine(input);
    await addCartLine({ ...input, cartVersion: 4 });

    expect(idempotencyLog[0]).not.toBe(idempotencyLog[1]);
  });

  it("returns OutOfStock instead of throwing, so a form can render it", async () => {
    server.use(
      http.post(`${API_BASE}/carts/:cartId/lines`, () =>
        HttpResponse.json(
          errorBody("out_of_stock", "insufficient", {
            variantId: "var_1",
            available: 2,
          }),
          { status: 409 },
        ),
      ),
    );

    const result = await addCartLine(input);
    expect(result).toEqual({
      ok: false,
      error: { kind: "OutOfStock", variantId: "var_1", available: 2 },
    });
  });

  it("returns PriceChanged with both prices for the accept-new-price flow", async () => {
    server.use(
      http.post(`${API_BASE}/carts/:cartId/lines`, () =>
        HttpResponse.json(
          errorBody("price_changed", "changed", {
            oldPrice: { amountMinor: 8900, currency: "EUR" },
            newPrice: { amountMinor: 9900, currency: "EUR" },
          }),
          { status: 409 },
        ),
      ),
    );

    const result = await addCartLine(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("PriceChanged");
  });

  it("forwards the session cookie to the API", async () => {
    __setCookie(SESSION_COOKIE, "tok_abc");
    let seen: string | null = null;

    server.use(
      http.post(`${API_BASE}/carts/:cartId/lines`, ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json(cartFixture);
      }),
    );

    await addCartLine(input);
    expect(seen).toBe("Bearer tok_abc");
  });

  it("sends no authorization header for a guest", async () => {
    let seen: string | null = "unset";

    server.use(
      http.post(`${API_BASE}/carts/:cartId/lines`, ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json(cartFixture);
      }),
    );

    await addCartLine(input);
    expect(seen).toBeNull();
  });
});

// The three mutations below share addCartLine's idempotency pattern. They are
// tested separately because "same pattern" is an assumption until verified.
describe("updateCartLineQuantity", () => {
  const base = {
    cartId: "cart_1",
    cartVersion: 3,
    lineId: "line_1",
    quantity: 2,
  };

  it("collapses a retry and distinguishes a later change", async () => {
    await updateCartLineQuantity(base);
    await updateCartLineQuantity(base);
    expect(idempotencyLog[0]).toBe(idempotencyLog[1]);

    await updateCartLineQuantity({ ...base, cartVersion: 4 });
    expect(idempotencyLog[2]).not.toBe(idempotencyLog[0]);
  });

  it("keys on the quantity, so 2 and 3 are different intents", async () => {
    await updateCartLineQuantity(base);
    await updateCartLineQuantity({ ...base, quantity: 3 });
    expect(idempotencyLog[0]).not.toBe(idempotencyLog[1]);
  });

  it("treats quantity 0 as removal and still sends a key", async () => {
    const result = await updateCartLineQuantity({ ...base, quantity: 0 });
    expect(result.ok).toBe(true);
    expect(idempotencyLog[0]).not.toBe("<missing>");
  });
});

describe("removeCartLine", () => {
  it("sends a deterministic key and returns the updated cart", async () => {
    const input = { cartId: "cart_1", cartVersion: 3, lineId: "line_1" };
    const result = await removeCartLine(input);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.lines).toHaveLength(0);

    await removeCartLine(input);
    expect(idempotencyLog[0]).toBe(idempotencyLog[1]);
  });
});

describe("createCart", () => {
  it("collapses retries carrying the same seed", async () => {
    await createCart("visitor_nonce_1");
    await createCart("visitor_nonce_1");
    expect(idempotencyLog[0]).toBe(idempotencyLog[1]);
    expect(idempotencyLog[0]).not.toBe("<missing>");
  });

  it("produces a different key for a different visitor", async () => {
    await createCart("visitor_nonce_1");
    await createCart("visitor_nonce_2");
    expect(idempotencyLog[0]).not.toBe(idempotencyLog[1]);
  });
});

describe("getCart", () => {
  it("returns the cart", async () => {
    await expect(getCart("cart_1")).resolves.toMatchObject({ id: "cart_1" });
  });

  it("rejects a cart whose per-line price violates the schema", async () => {
    // Totals here are perfectly valid: the backend computes them independently,
    // so a corrupt line price can hide behind a clean total. That line is what
    // the customer actually reads.
    server.use(
      http.get(`${API_BASE}/carts/:cartId`, () =>
        HttpResponse.json({
          ...cartFixture,
          lines: [
            {
              ...cartFixture.lines[0],
              unitPrice: { amountMinor: 89.99, currency: "EUR" },
            },
          ],
        }),
      ),
    );

    await expect(getCart("cart_1")).rejects.toMatchObject({
      error: { kind: "Unavailable" },
    });
  });

  it("rejects a cart whose totals violate the schema", async () => {
    server.use(
      http.get(`${API_BASE}/carts/:cartId`, () =>
        HttpResponse.json({
          ...cartFixture,
          totals: { subtotal: { amountMinor: "8900", currency: "EUR" } },
        }),
      ),
    );

    await expect(getCart("cart_1")).rejects.toMatchObject({
      error: { kind: "Unavailable" },
    });
  });
});
