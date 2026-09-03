import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { API_BASE, errorBody, offerFixture } from "@/mocks/handlers";
import { CommerceErrorException } from "../errors";
import { getOffer, getProduct } from "./queries";

describe("getProduct", () => {
  it("returns product content", async () => {
    const product = await getProduct("merino-crew");
    expect(product.slug).toBe("merino-crew");
  });

  it("carries no price or stock, so a cached shell cannot go stale", async () => {
    const product = await getProduct("merino-crew");
    expect(product).not.toHaveProperty("price");
    expect(product).not.toHaveProperty("availability");
  });

  it("throws a normalised domain error, never a raw payload", async () => {
    server.use(
      http.get(`${API_BASE}/products/:slug`, () =>
        HttpResponse.json(errorBody("unavailable"), { status: 503 }),
      ),
    );

    await expect(getProduct("merino-crew")).rejects.toBeInstanceOf(
      CommerceErrorException,
    );
    await expect(getProduct("merino-crew")).rejects.toMatchObject({
      error: { kind: "Unavailable", retryable: true },
    });
  });
});

describe("getOffer", () => {
  it("returns price and availability", async () => {
    await expect(getOffer("merino-crew")).resolves.toEqual(offerFixture);
  });

  it("rejects a response whose price violates the schema", async () => {
    // The generated types claim `amountMinor` is an integer. They cannot enforce
    // it. A float price reaching the UI is a wrong charge, so it is caught here.
    server.use(
      http.get(`${API_BASE}/products/:slug/offer`, () =>
        HttpResponse.json({
          ...offerFixture,
          price: { amountMinor: 89.99, currency: "EUR" },
        }),
      ),
    );

    await expect(getOffer("merino-crew")).rejects.toMatchObject({
      error: { kind: "Unavailable" },
    });
  });

  it("rejects a response missing availability", async () => {
    server.use(
      http.get(`${API_BASE}/products/:slug/offer`, () =>
        HttpResponse.json({ variantId: "var_1", price: offerFixture.price }),
      ),
    );

    await expect(getOffer("merino-crew")).rejects.toBeInstanceOf(
      CommerceErrorException,
    );
  });
});
