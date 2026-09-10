import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { API_BASE, errorBody, offerFixture } from "@/mocks/handlers";
import { appliedTags } from "@/test/stubs/next-cache";
import { __setCookie } from "@/test/stubs/next-headers";
import { CommerceErrorException } from "../errors";
import { SESSION_COOKIE } from "../session";
import { getOffer, getProduct, listProducts, productTag } from "./queries";

describe("getProduct", () => {
  it("returns product content", async () => {
    const product = await getProduct("toner-compatibil-hp-35a-black-cb435a");
    expect(product?.slug).toBe("toner-compatibil-hp-35a-black-cb435a");
  });

  it("carries no price or stock, so a cached shell cannot go stale", async () => {
    const product = await getProduct("toner-compatibil-hp-35a-black-cb435a");
    expect(product).not.toHaveProperty("price");
    expect(product).not.toHaveProperty("availability");
  });

  it("returns null for a missing product instead of throwing", async () => {
    server.use(
      http.get(`${API_BASE}/products/:slug`, () =>
        HttpResponse.json(errorBody("not_found"), { status: 404 }),
      ),
    );

    await expect(getProduct("no-such-product")).resolves.toBeNull();
  });

  it("throws a normalised domain error for non-404 failures", async () => {
    server.use(
      http.get(`${API_BASE}/products/:slug`, () =>
        HttpResponse.json(errorBody("unavailable"), { status: 503 }),
      ),
    );

    await expect(
      getProduct("toner-compatibil-hp-35a-black-cb435a"),
    ).rejects.toBeInstanceOf(CommerceErrorException);
    await expect(
      getProduct("toner-compatibil-hp-35a-black-cb435a"),
    ).rejects.toMatchObject({
      error: { kind: "Unavailable", retryable: true },
    });
  });
});

describe("catalog caching", () => {
  it("tags the product with the same string the revalidation path uses", async () => {
    // A tag that differs between read and write fails silently: the cache just
    // never invalidates. Both sides go through productTag() for this reason.
    await getProduct("toner-compatibil-hp-35a-black-cb435a");
    expect(appliedTags).toContain(
      productTag("toner-compatibil-hp-35a-black-cb435a"),
    );
  });

  it("tags the listing so a publish can invalidate it", async () => {
    await listProducts();
    expect(appliedTags).toContain("product-list");
  });

  it("does not tag the offer, which must never be cached", async () => {
    await getOffer("toner-compatibil-hp-35a-black-cb435a");
    expect(appliedTags).toHaveLength(0);
  });
});

describe("catalog requests carry no session", () => {
  // Catalog responses land in a cache shared by every visitor. A session
  // travelling with them risks one shopper's response being served to another,
  // and cookies cannot be read inside a `use cache` scope anyway.
  it("sends no authorization header even when a session cookie exists", async () => {
    __setCookie(SESSION_COOKIE, "tok_abc");
    let seen: string | null = "unset";

    server.use(
      http.get(`${API_BASE}/products/:slug/offer`, ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json(offerFixture);
      }),
    );

    await getOffer("toner-compatibil-hp-35a-black-cb435a");
    expect(seen).toBeNull();
  });
});

describe("getOffer", () => {
  it("returns price and availability", async () => {
    await expect(
      getOffer("toner-compatibil-hp-35a-black-cb435a"),
    ).resolves.toEqual(offerFixture);
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

    await expect(
      getOffer("toner-compatibil-hp-35a-black-cb435a"),
    ).rejects.toMatchObject({
      error: { kind: "Unavailable" },
    });
  });

  it("rejects a response missing availability", async () => {
    server.use(
      http.get(`${API_BASE}/products/:slug/offer`, () =>
        HttpResponse.json({ variantId: "var_1", price: offerFixture.price }),
      ),
    );

    await expect(
      getOffer("toner-compatibil-hp-35a-black-cb435a"),
    ).rejects.toBeInstanceOf(CommerceErrorException);
  });
});
