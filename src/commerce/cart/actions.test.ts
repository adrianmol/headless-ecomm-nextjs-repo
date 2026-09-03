import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { API_BASE, cartFixture, errorBody, idempotencyLog } from "@/mocks/handlers";
import { __setCookie, cookies } from "@/test/stubs/next-headers";
import { CART_COOKIE } from "../session";
import { addToCartAction, setLineQuantityAction } from "./actions";

const readCartCookie = async () => (await cookies()).get(CART_COOKIE)?.value;

describe("addToCartAction", () => {
  it("creates a cart on first write and persists the id in a cookie", async () => {
    expect(await readCartCookie()).toBeUndefined();

    const result = await addToCartAction({
      variantId: "var_1",
      quantity: 1,
      seed: "seed-1",
    });

    expect(result).toEqual({ status: "ok" });
    expect(await readCartCookie()).toBe("cart_1");
  });

  it("does not create a second cart when one already exists", async () => {
    __setCookie(CART_COOKIE, "cart_1");
    let created = 0;

    server.use(
      http.post(`${API_BASE}/carts`, () => {
        created += 1;
        return HttpResponse.json(cartFixture, { status: 201 });
      }),
    );

    await addToCartAction({ variantId: "var_1", quantity: 1, seed: "seed-1" });
    expect(created).toBe(0);
  });

  it("collapses a double-clicked first add into one cart", async () => {
    // Both calls carry the same seed, which is what the client's stable button
    // id guarantees. Without it, two carts.
    let created = 0;
    server.use(
      http.post(`${API_BASE}/carts`, ({ request }) => {
        created += 1;
        idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
        return HttpResponse.json(cartFixture, { status: 201 });
      }),
    );

    await addToCartAction({ variantId: "var_1", quantity: 1, seed: "same-seed" });
    const keyForFirstAdd = idempotencyLog[0];

    // Second call now finds the cookie, so it does not create at all.
    await addToCartAction({ variantId: "var_1", quantity: 1, seed: "same-seed" });
    expect(created).toBe(1);
    expect(keyForFirstAdd).not.toBe("<missing>");
  });

  it("recovers from a stale cart cookie by starting a fresh cart", async () => {
    // A cart the backend has forgotten must not dead-end the shopper.
    __setCookie(CART_COOKIE, "cart_gone");
    server.use(
      http.get(`${API_BASE}/carts/cart_gone`, () =>
        HttpResponse.json(errorBody("cart_expired", "expired"), { status: 409 }),
      ),
    );

    const result = await addToCartAction({
      variantId: "var_1",
      quantity: 1,
      seed: "seed-2",
    });

    expect(result).toEqual({ status: "ok" });
    expect(await readCartCookie()).toBe("cart_1");
  });

  it("surfaces out_of_stock as machine-readable feedback, not prose", async () => {
    __setCookie(CART_COOKIE, "cart_1");
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

    expect(
      await addToCartAction({ variantId: "var_1", quantity: 5, seed: "s" }),
    ).toEqual({ status: "out_of_stock", available: 2 });
  });

  it("carries the new price through so the customer can accept it", async () => {
    __setCookie(CART_COOKIE, "cart_1");
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

    expect(
      await addToCartAction({ variantId: "var_1", quantity: 1, seed: "s" }),
    ).toEqual({
      status: "price_changed",
      newPrice: { amountMinor: 9900, currency: "EUR" },
    });
  });

  it("keeps a retryable server fault distinguishable from a shopper problem", async () => {
    __setCookie(CART_COOKIE, "cart_1");
    server.use(
      http.post(`${API_BASE}/carts/:cartId/lines`, () =>
        HttpResponse.json(errorBody("unavailable", "boom"), { status: 503 }),
      ),
    );

    expect(
      await addToCartAction({ variantId: "var_1", quantity: 1, seed: "s" }),
    ).toEqual({ status: "error", retryable: true });
  });
});

describe("setLineQuantityAction", () => {
  it("reports an expired basket when there is no cart cookie", async () => {
    expect(
      await setLineQuantityAction({ lineId: "line_1", quantity: 2 }),
    ).toEqual({ status: "cart_expired" });
  });

  it("sends an absolute quantity keyed to the current cart version", async () => {
    __setCookie(CART_COOKIE, "cart_1");
    let body: unknown;

    server.use(
      http.patch(`${API_BASE}/carts/:cartId/lines/:lineId`, async ({ request }) => {
        body = await request.json();
        idempotencyLog.push(request.headers.get("Idempotency-Key") ?? "<missing>");
        return HttpResponse.json(cartFixture);
      }),
    );

    await setLineQuantityAction({ lineId: "line_1", quantity: 4 });

    expect(body).toEqual({ quantity: 4 });
    // cartFixture.version is 3, and the key must be scoped to it.
    expect(idempotencyLog[0]).toContain("3");
  });
});

describe("setLineQuantityAction input guard", () => {
  it("rejects a non-integer quantity instead of forwarding it", async () => {
    // Regression: the stepper once computed Infinity, which JSON-serialises to
    // null and was read downstream as 0, silently deleting the line.
    __setCookie(CART_COOKIE, "cart_1");

    for (const quantity of [Number.POSITIVE_INFINITY, Number.NaN, 1.5, -1]) {
      expect(await setLineQuantityAction({ lineId: "line_1", quantity })).toEqual({
        status: "error",
        retryable: false,
      });
    }
  });
});
