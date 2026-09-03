import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { API_BASE, errorBody, idempotencyLog } from "@/mocks/handlers";
import { CommerceErrorException } from "../errors";
import { createCheckoutSession } from "./mutations";
import { getOrder } from "./queries";

const session = {
  orderRef: "ord_1",
  redirectUrl: "https://psp.test/pay/ord_1",
};
const paidOrder = {
  id: "ord_1",
  status: "paid",
  total: { amountMinor: 8900, currency: "EUR" },
};

describe("createCheckoutSession", () => {
  it("returns the PSP redirect URL", async () => {
    server.use(
      http.post(`${API_BASE}/checkout/sessions`, ({ request }) => {
        idempotencyLog.push(
          request.headers.get("Idempotency-Key") ?? "<missing>",
        );
        return HttpResponse.json(session, { status: 201 });
      }),
    );

    const result = await createCheckoutSession({
      cartId: "cart_1",
      cartVersion: 3,
      email: "a@b.test",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.redirectUrl).toBe(session.redirectUrl);
  });

  it("sends the same key for a double-clicked Pay, so one order is created", async () => {
    server.use(
      http.post(`${API_BASE}/checkout/sessions`, ({ request }) => {
        idempotencyLog.push(
          request.headers.get("Idempotency-Key") ?? "<missing>",
        );
        return HttpResponse.json(session, { status: 201 });
      }),
    );

    const input = { cartId: "cart_1", cartVersion: 3, email: "a@b.test" };
    await createCheckoutSession(input);
    await createCheckoutSession(input);

    expect(idempotencyLog[0]).toBe(idempotencyLog[1]);
    expect(idempotencyLog[0]).not.toBe("<missing>");
  });

  it("uses a different key once the cart has changed", async () => {
    // A genuine second checkout after editing the basket must not be collapsed
    // into the first one.
    server.use(
      http.post(`${API_BASE}/checkout/sessions`, ({ request }) => {
        idempotencyLog.push(
          request.headers.get("Idempotency-Key") ?? "<missing>",
        );
        return HttpResponse.json(session, { status: 201 });
      }),
    );

    await createCheckoutSession({
      cartId: "cart_1",
      cartVersion: 3,
      email: "a@b.test",
    });
    await createCheckoutSession({
      cartId: "cart_1",
      cartVersion: 4,
      email: "a@b.test",
    });

    expect(idempotencyLog[0]).not.toBe(idempotencyLog[1]);
  });

  it("surfaces a price change instead of proceeding to payment", async () => {
    server.use(
      http.post(`${API_BASE}/checkout/sessions`, () =>
        HttpResponse.json(
          errorBody("price_changed", "changed", {
            oldPrice: { amountMinor: 8900, currency: "EUR" },
            newPrice: { amountMinor: 9900, currency: "EUR" },
          }),
          { status: 409 },
        ),
      ),
    );

    const result = await createCheckoutSession({
      cartId: "cart_1",
      cartVersion: 3,
      email: "a@b.test",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("PriceChanged");
  });
});

describe("getOrder", () => {
  it("returns validated order state", async () => {
    server.use(
      http.get(`${API_BASE}/orders/:ref`, () => HttpResponse.json(paidOrder)),
    );
    await expect(getOrder("ord_1")).resolves.toEqual(paidOrder);
  });

  it("forwards the session so a bare reference is not authorisation", async () => {
    // Knowing an order id must not be enough to read someone else's order; the
    // backend authorises, and it can only do that if we forward the session.
    let sawAuthHeader = false;
    server.use(
      http.get(`${API_BASE}/orders/:ref`, ({ request }) => {
        sawAuthHeader = request.headers.has("authorization");
        return HttpResponse.json(paidOrder);
      }),
    );

    const { __setCookie } = await import("@/test/stubs/next-headers");
    const { SESSION_COOKIE } = await import("../session");
    __setCookie(SESSION_COOKIE, "tok_abc");

    await getOrder("ord_1");
    expect(sawAuthHeader).toBe(true);
  });

  it("rejects an unrecognised status rather than rendering it", async () => {
    server.use(
      http.get(`${API_BASE}/orders/:ref`, () =>
        HttpResponse.json({ ...paidOrder, status: "definitely_paid_trust_me" }),
      ),
    );
    await expect(getOrder("ord_1")).rejects.toBeInstanceOf(
      CommerceErrorException,
    );
  });

  it("rejects a float total", async () => {
    server.use(
      http.get(`${API_BASE}/orders/:ref`, () =>
        HttpResponse.json({
          ...paidOrder,
          total: { amountMinor: 89.99, currency: "EUR" },
        }),
      ),
    );
    await expect(getOrder("ord_1")).rejects.toMatchObject({
      error: { kind: "Unavailable" },
    });
  });
});
