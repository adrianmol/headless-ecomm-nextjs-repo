import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatedTags, resetCacheStub } from "@/test/stubs/next-cache";
import { POST } from "./route";

const GOOD_SECRET = "a".repeat(64);

/** `secret: null` omits the header entirely; omitting the argument sends a valid one. */
function post(body: unknown, secret: string | null = GOOD_SECRET) {
  return POST(
    new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: secret === null ? {} : { "x-revalidate-secret": secret },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  resetCacheStub();
  process.env.REVALIDATE_SECRET = GOOD_SECRET;
});

afterEach(() => {
  delete process.env.REVALIDATE_SECRET;
  vi.restoreAllMocks();
});

/**
 * The only endpoint that can flush the catalog cache, and it had no tests. A
 * public version of it would be a free denial-of-service lever: forcing every
 * request to miss sends the whole load to the commerce API.
 */
describe("POST /api/revalidate", () => {
  it("revalidates the named products and the listing", async () => {
    const response = await post({
      slugs: [
        "toner-compatibil-hp-35a-black-cb435a",
        "toner-compatibil-brother-tn-2000-black",
      ],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      revalidated: 2,
      listRevalidated: true,
    });
    // Asserted against the real tag strings: a mismatch between the read path
    // and this one fails silently in production — the cache just never expires.
    expect(revalidatedTags).toContain(
      "product:toner-compatibil-hp-35a-black-cb435a",
    );
    expect(revalidatedTags).toContain(
      "product:toner-compatibil-brother-tn-2000-black",
    );
    expect(revalidatedTags).toContain("product-list");
  });

  it("rejects a wrong secret without revalidating anything", async () => {
    const response = await post(
      { slugs: ["toner-compatibil-hp-35a-black-cb435a"] },
      "b".repeat(64),
    );

    expect(response.status).toBe(401);
    expect(revalidatedTags).toEqual([]);
  });

  it("rejects a missing secret header", async () => {
    expect((await post({ slugs: [] }, null)).status).toBe(401);
    expect(revalidatedTags).toEqual([]);
  });

  it.each([
    ["shorter than the real secret", "a".repeat(32)],
    ["longer than the real secret", "a".repeat(128)],
    ["empty", ""],
  ])("rejects a secret %s", async (_label, provided) => {
    // Length must not change the answer. The comparison hashes both sides to a
    // fixed 32 bytes precisely so a length mismatch is not observable.
    const response = await post(
      { slugs: ["toner-compatibil-hp-35a-black-cb435a"] },
      provided,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(revalidatedTags).toEqual([]);
  });

  it("is inert when no secret is configured", async () => {
    delete process.env.REVALIDATE_SECRET;

    const response = await post(
      { slugs: ["toner-compatibil-hp-35a-black-cb435a"] },
      GOOD_SECRET,
    );

    expect(response.status).toBe(503);
    expect(revalidatedTags).toEqual([]);
  });

  it("refuses a configured secret that is too weak, and says so in logs only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.REVALIDATE_SECRET = "hunter2-weak-key";

    const response = await post(
      { slugs: ["toner-compatibil-hp-35a-black-cb435a"] },
      "hunter2-weak-key",
    );

    // Identical response to "absent": a prober must not learn which it is.
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
    expect(revalidatedTags).toEqual([]);

    // The operator needs to know a secret was rejected rather than missing —
    // but the value itself must never reach the log.
    expect(warn).toHaveBeenCalledOnce();
    const line = warn.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toEqual({
      event: "revalidate_secret_rejected",
      reason: "too_short",
      length: 16,
    });
    // Previously asserted against "short", which is a substring of the
    // "too_short" reason — the assertion could not have failed. A value that
    // does not appear in the log line is what makes this a real check.
    expect(line).not.toContain("hunter2");
  });

  it("rejects a malformed body after authenticating", async () => {
    const response = await post("{{{not json", GOOD_SECRET);

    expect(response.status).toBe(400);
    expect(revalidatedTags).toEqual([]);
  });

  it("ignores non-string entries in slugs rather than failing", async () => {
    const response = await post(
      {
        slugs: [
          "toner-compatibil-hp-35a-black-cb435a",
          42,
          null,
          { slug: "nope" },
        ],
      },
      GOOD_SECRET,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      revalidated: 1,
      listRevalidated: true,
    });
    expect(revalidatedTags).toContain(
      "product:toner-compatibil-hp-35a-black-cb435a",
    );
  });

  it("revalidates HUB products by sku, and leaves the other catalogue alone", async () => {
    const response = await post({
      hub: { products: ["CN-PGI29C", 42, ""], categories: [25968, -1, "x"] },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      hub: { products: 1, categories: 1, all: false },
    });
    // The real tag strings, for the reason given above: a mismatch with the
    // read path means a price change that never reaches the page.
    expect(revalidatedTags).toEqual([
      "hub-product:CN-PGI29C",
      "hub-category:25968",
    ]);
  });

  it("flushes everything from HUB only when asked to", async () => {
    await post({ hub: { all: true } });
    expect(revalidatedTags).toEqual(["hub-catalog"]);
  });

  it("still revalidates the listing when no slugs are supplied", async () => {
    // A publish that only reorders the catalog has no slug to name.
    const response = await post({ slugs: [] }, GOOD_SECRET);

    expect(response.status).toBe(200);
    expect(revalidatedTags).toEqual(["product-list"]);
  });
});
