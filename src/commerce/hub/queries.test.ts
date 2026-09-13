import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { resetHubConfigCache } from "@/lib/env";
import { appliedTags, resetCacheStub } from "@/test/stubs/next-cache";
import { CommerceErrorException } from "../errors";
import {
  MAX_LIVE_KEYS,
  getHubCategories,
  getHubCategoryPage,
  getHubLiveOffers,
  getHubProduct,
  hubPing,
} from "./queries";

const BASE = "https://hub.test";

const PRICE = {
  value: 66,
  special: null,
  currency: "RON",
  tax_included: true,
  show: true,
};
const STOCK = {
  state: "limitat",
  label: "Stoc limitat",
  orderable: true,
  quantity: 30,
};
const SUMMARY = {
  id: 12679,
  sku: "DEV-D3130C",
  url: "dev-d3130c",
  name: "Carrier / Developer",
  brand: "Dell",
  manufacturer: "SCC",
  type: "drefill",
  is_pack: false,
  price: PRICE,
  stock: STOCK,
  image: null,
  meta: { title: "t", description: "d" },
};
const CATEGORY = {
  id: 1727,
  parent: 5431,
  name: "Kyocera TK-7300",
  url: "",
  kind: "family",
  title: "kyocera_tk7300",
  image: null,
  meta: { title: "", description: "" },
};

/** Records the URL each call actually requested. */
let requested: string[] = [];

function reply(path: string, body: Record<string, unknown>, status = 200) {
  server.use(
    http.get(`${BASE}${path}`, ({ request }) => {
      requested.push(request.url);
      return HttpResponse.json(body, { status });
    }),
  );
}

beforeEach(() => {
  requested = [];
  resetCacheStub();
  resetHubConfigCache();
  process.env.HUB_API_URL = BASE;
  process.env.HUB_API_KEY = "hk_testkey0000";
  process.env.HUB_API_SECRET = "s".repeat(64);
});

afterEach(() => {
  delete process.env.HUB_API_URL;
  delete process.env.HUB_API_KEY;
  delete process.env.HUB_API_SECRET;
  resetHubConfigCache();
});

describe("getHubCategories", () => {
  it("returns the tree flat, with parent pointers intact", async () => {
    reply("/hub-api/v1/category", {
      ok: true,
      data: { shop: null, categories: [CATEGORY] },
    });

    const categories = await getHubCategories();

    expect(categories).toHaveLength(1);
    // Flat and parent-pointed on purpose: composing the tree is the caller's
    // job, and 75% of live nodes name a parent that is not in the list, so a
    // caller must be able to see that rather than be handed a lie.
    expect(categories[0]).toMatchObject({ id: 1727, parentId: 5431, slug: "" });
  });

  it("only asks for counts when requested, because counting costs a catalog pass", async () => {
    reply("/hub-api/v1/category", {
      ok: true,
      data: { shop: null, categories: [] },
    });

    await getHubCategories();
    expect(requested[0]).not.toContain("numara");

    await getHubCategories({ withCounts: true });
    // `count`, not `numara`: verified on 2026-09-13 that the Romanian name
    // produced no count at all, silently.
    expect(requested[1]).toContain("count=1");
  });
});

describe("getHubCategoryPage", () => {
  it("maps the category, its children, products and pagination", async () => {
    reply("/hub-api/v1/category/1727", {
      ok: true,
      data: {
        shop: null,
        category: { ...CATEGORY, products: 326 },
        children: [{ ...CATEGORY, id: 21724, parent: 1727 }],
        products: [SUMMARY],
        pagination: { page: 1, per_page: 24, total: 326, pages: 14 },
      },
    });

    const page = await getHubCategoryPage(1727);

    expect(page).not.toBeNull();
    expect(page!.category.productCount).toBe(326);
    expect(page!.children).toHaveLength(1);
    expect(page!.products[0].offer.price).toEqual({
      amountMinor: 6600,
      currency: "RON",
    });
    expect(page!.pagination).toEqual({
      page: 1,
      perPage: 24,
      total: 326,
      pages: 14,
    });
  });

  it("sends page-based paging and sorting as the contract names them", async () => {
    reply("/hub-api/v1/category/1727", {
      ok: true,
      data: {
        shop: null,
        category: CATEGORY,
        children: [],
        products: [],
        pagination: { page: 2, per_page: 50, total: 0, pages: 0 },
      },
    });

    await getHubCategoryPage(1727, {
      page: 2,
      perPage: 50,
      sort: "price_desc",
      deep: true,
    });

    /*
      Every one of these names was verified against the live API. The Romanian
      spellings this code originally sent are accepted and ignored, so the
      request succeeded while the option did nothing: `pe_pagina=3` left per_page
      at 24, `pagina=2` left page at 1, and `adanc=1` returned a category's direct
      products only — 10 instead of 1541 for category 1878.
    */
    const url = new URL(requested[0]);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("sort")).toBe("price_desc");
    expect(url.searchParams.get("deep")).toBe("1");
  });

  it("clamps perPage to the documented maximum instead of earning a bad_request", async () => {
    reply("/hub-api/v1/category/1727", {
      ok: true,
      data: {
        shop: null,
        category: CATEGORY,
        children: [],
        products: [],
        pagination: { page: 1, per_page: 100, total: 0, pages: 0 },
      },
    });

    await getHubCategoryPage(1727, { perPage: 5000 });
    expect(new URL(requested[0]).searchParams.get("per_page")).toBe("100");
  });

  it("returns null for a category that does not exist", async () => {
    /*
      Null rather than a throw, and decided inside the cached function: a HubError
      does not survive the `use cache` boundary as itself, so an `instanceof` check
      in a caller silently never matched — an unknown category reached the page as an
      anonymous error and the response carried no `noindex`.
    */
    reply(
      "/hub-api/v1/category/99999999",
      { ok: false, error: { code: "not_found" } },
      404,
    );

    await expect(getHubCategoryPage(99999999)).resolves.toBeNull();
  });

  it("still propagates a real failure rather than reporting it as missing", async () => {
    reply(
      "/hub-api/v1/category/1727",
      { ok: false, error: { code: "server_error" } },
      500,
    );

    await expect(getHubCategoryPage(1727)).rejects.toMatchObject({
      code: "server_error",
    });
  });

  it("refuses a non-positive id locally", async () => {
    await expect(getHubCategoryPage(0)).rejects.toBeInstanceOf(
      CommerceErrorException,
    );
  });

  it("treats a malformed payload as an infrastructure fault", async () => {
    reply("/hub-api/v1/category/1727", {
      ok: true,
      data: { category: CATEGORY, pagination: { page: "one" } },
    });

    await expect(getHubCategoryPage(1727)).rejects.toBeInstanceOf(
      CommerceErrorException,
    );
  });
});

describe("getHubProduct", () => {
  it("resolves by id, sku and slug to the same shape", async () => {
    for (const path of [
      "/hub-api/v1/product/12679",
      "/hub-api/v1/product/DEV-D3130C",
      "/hub-api/v1/product",
    ]) {
      reply(path, { ok: true, data: { shop: null, product: SUMMARY } });
    }

    const byId = await getHubProduct({ by: "id", value: 12679 });
    const bySku = await getHubProduct({ by: "sku", value: "DEV-D3130C" });
    const bySlug = await getHubProduct({ by: "slug", value: "dev-d3130c" });

    expect(byId?.sku).toBe("DEV-D3130C");
    expect(bySku?.sku).toBe("DEV-D3130C");
    expect(bySlug?.sku).toBe("DEV-D3130C");
    // The slug form goes on the query string, per the contract.
    expect(requested[2]).toContain("url=dev-d3130c");
  });

  it("returns null for not_found rather than throwing", async () => {
    // A missing product is an ordinary outcome a caller renders as a 404, which
    // is how getProduct already behaves in the existing catalog layer.
    reply(
      "/hub-api/v1/product/nope",
      { ok: false, error: { code: "not_found", message: "nu exista" } },
      404,
    );

    await expect(
      getHubProduct({ by: "sku", value: "nope" }),
    ).resolves.toBeNull();
  });

  it("propagates a real failure instead of pretending the product is missing", async () => {
    reply(
      "/hub-api/v1/product/x",
      { ok: false, error: { code: "server_error" } },
      500,
    );

    await expect(
      getHubProduct({ by: "sku", value: "x" }),
    ).rejects.toMatchObject({
      code: "server_error",
    });
  });

  it("reads siblings from beside the product, not from inside it", async () => {
    // The envelope is { shop, product, related } — `related` is a sibling. An
    // earlier schema looked for it nested and, being optional, silently reported
    // every product as having none.
    reply("/hub-api/v1/product/12679", {
      ok: true,
      data: {
        shop: null,
        product: SUMMARY,
        related: [{ ...SUMMARY, id: 999, sku: "SIBLING-1" }],
      },
    });

    const product = await getHubProduct(
      { by: "id", value: 12679 },
      { withVariants: true },
    );

    expect(product?.variants).toHaveLength(1);
    expect(product?.variants?.[0].sku).toBe("SIBLING-1");
  });

  it("asks for variants only when requested", async () => {
    reply("/hub-api/v1/product/12679", {
      ok: true,
      data: { shop: null, product: SUMMARY },
    });

    await getHubProduct({ by: "id", value: 12679 }, { withVariants: true });
    // `related=1`, not `rude=1`: verified against DEV-EC3800Y, where the former
    // returns six siblings and the latter returns none.
    expect(new URL(requested[0]).searchParams.get("related")).toBe("1");
  });
});

describe("getHubLiveOffers", () => {
  const live = (over: Record<string, unknown> = {}) => ({
    ok: true,
    data: {
      products: [{ id: 12679, sku: "DEV-D3130C", price: PRICE, stock: STOCK }],
      missing: [],
      ...over,
    },
  });

  it("returns fresh price and stock, and what went missing", async () => {
    reply("/hub-api/v1/live", live({ missing: ["EOL-1", "EOL-2"] }));

    const result = await getHubLiveOffers({ skus: ["DEV-D3130C", "EOL-1"] });

    expect(result.entries[0].offer.price?.amountMinor).toBe(6600);
    // Without this list the storefront would keep the old price on screen and
    // never learn why. A caller ignoring it reintroduces that bug.
    expect(result.missing).toEqual(["EOL-1", "EOL-2"]);
  });

  it("is NEVER cached, unlike every other read here", async () => {
    // The uncached half of the arrangement that makes a stale price
    // structurally impossible. Asserted through the cache stub: a cached scope
    // records its tags, and this one must record none.
    reply("/hub-api/v1/product/12679", {
      ok: true,
      data: { shop: null, product: SUMMARY },
    });
    await getHubProduct({ by: "id", value: 12679 });
    const tagsAfterCachedRead = [...appliedTags];
    expect(tagsAfterCachedRead.length).toBeGreaterThan(0);

    resetCacheStub();
    reply("/hub-api/v1/live", live());
    await getHubLiveOffers({ ids: [12679] });

    expect(appliedTags).toEqual([]);
  });

  it("sends ids or skus under the right parameter name", async () => {
    reply("/hub-api/v1/live", live());

    await getHubLiveOffers({ ids: [1, 2, 3] });
    expect(new URL(requested[0]).searchParams.get("ids")).toBe("1,2,3");

    await getHubLiveOffers({ skus: ["A", "B"] });
    expect(new URL(requested[1]).searchParams.get("skus")).toBe("A,B");
  });

  it("short-circuits an empty request without calling upstream", async () => {
    const result = await getHubLiveOffers({ ids: [] });
    expect(result).toEqual({ entries: [], missing: [] });
    expect(requested).toEqual([]);
  });

  it("refuses more than the documented maximum locally", async () => {
    // Upstream would answer bad_request; the caller's real bug is asking for an
    // unbounded set, and saying so locally is more useful than a 400.
    const tooMany = Array.from({ length: MAX_LIVE_KEYS + 1 }, (_, i) => i + 1);

    await expect(getHubLiveOffers({ ids: tooMany })).rejects.toThrow(
      /at most 200 keys, received 201/,
    );
    expect(requested).toEqual([]);
  });

  it("normalises numeric entries in the missing list to strings", async () => {
    reply("/hub-api/v1/live", live({ missing: [12679, "EOL-1"] }));

    const result = await getHubLiveOffers({ ids: [12679] });
    expect(result.missing).toEqual(["12679", "EOL-1"]);
  });
});

describe("hubPing", () => {
  it("confirms the signature chain and reports the key's scope", async () => {
    reply("/hub-api/v1/ping", {
      ok: true,
      data: {
        pong: true,
        time: "2026-09-13T18:32:13+00:00",
        shop_id: 0,
        scope: "read",
        mode: "http",
      },
    });

    await expect(hubPing()).resolves.toEqual({
      time: "2026-09-13T18:32:13+00:00",
      shopId: 0,
      scope: "read",
    });
  });

  it("is never cached, because a cached probe reports the past", async () => {
    reply("/hub-api/v1/ping", {
      ok: true,
      data: { pong: true, time: "t", shop_id: 0, scope: "read" },
    });

    await hubPing();
    expect(appliedTags).toEqual([]);
  });

  it("rejects a response that is not a successful pong", async () => {
    reply("/hub-api/v1/ping", { ok: true, data: { pong: false } });
    await expect(hubPing()).rejects.toBeInstanceOf(CommerceErrorException);
  });
});
