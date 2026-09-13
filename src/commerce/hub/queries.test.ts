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
} from "./queries";

const BASE = "https://hub.test";

const PRICE = {
  valoare: 66,
  promo: null,
  moneda: "RON",
  cu_tva: true,
  se_arata: true,
};
const STOCK = {
  stare: "limitat",
  eticheta: "Stoc limitat",
  se_comanda: true,
  cantitate: 30,
};
const SUMMARY = {
  id: 12679,
  sku: "DEV-D3130C",
  url: "dev-d3130c",
  nume: "Carrier / Developer",
  brand: "Dell",
  producator: "SCC",
  tip: "drefill",
  pachet: false,
  pret: PRICE,
  stoc: STOCK,
  imagine: null,
  meta: { titlu: "t", descriere: "d" },
};
const CATEGORY = {
  id: 1727,
  parinte: 5431,
  nume: "Kyocera TK-7300",
  url: "",
  fel: "family",
  titlu: "kyocera_tk7300",
  imagine: null,
  meta: { titlu: "", descriere: "" },
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
      data: { shop: null, categorii: [CATEGORY] },
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
      data: { shop: null, categorii: [] },
    });

    await getHubCategories();
    expect(requested[0]).not.toContain("numara");

    await getHubCategories({ withCounts: true });
    expect(requested[1]).toContain("numara=1");
  });
});

describe("getHubCategoryPage", () => {
  it("maps the category, its children, products and pagination", async () => {
    reply("/hub-api/v1/category/1727", {
      ok: true,
      data: {
        shop: null,
        categorie: { ...CATEGORY, produse: 326 },
        copii: [{ ...CATEGORY, id: 21724, parinte: 1727 }],
        produse: [SUMMARY],
        paginare: { pagina: 1, pe_pagina: 24, total: 326, pagini: 14 },
      },
    });

    const page = await getHubCategoryPage(1727);

    expect(page.category.productCount).toBe(326);
    expect(page.children).toHaveLength(1);
    expect(page.products[0].offer.price).toEqual({
      amountMinor: 6600,
      currency: "RON",
    });
    expect(page.pagination).toEqual({
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
        categorie: CATEGORY,
        copii: [],
        produse: [],
        paginare: { pagina: 2, pe_pagina: 50, total: 0, pagini: 0 },
      },
    });

    await getHubCategoryPage(1727, {
      page: 2,
      perPage: 50,
      sort: "pret_desc",
      deep: true,
    });

    const url = new URL(requested[0]);
    expect(url.searchParams.get("pagina")).toBe("2");
    expect(url.searchParams.get("pe_pagina")).toBe("50");
    expect(url.searchParams.get("sort")).toBe("pret_desc");
    expect(url.searchParams.get("adanc")).toBe("1");
  });

  it("clamps perPage to the documented maximum instead of earning a bad_request", async () => {
    reply("/hub-api/v1/category/1727", {
      ok: true,
      data: {
        shop: null,
        categorie: CATEGORY,
        copii: [],
        produse: [],
        paginare: { pagina: 1, pe_pagina: 100, total: 0, pagini: 0 },
      },
    });

    await getHubCategoryPage(1727, { perPage: 5000 });
    expect(new URL(requested[0]).searchParams.get("pe_pagina")).toBe("100");
  });

  it("refuses a non-positive id locally", async () => {
    await expect(getHubCategoryPage(0)).rejects.toBeInstanceOf(
      CommerceErrorException,
    );
  });

  it("treats a malformed payload as an infrastructure fault", async () => {
    reply("/hub-api/v1/category/1727", {
      ok: true,
      data: { categorie: CATEGORY, paginare: { pagina: "one" } },
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
      reply(path, { ok: true, data: { shop: null, produs: SUMMARY } });
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

  it("asks for variants only when requested", async () => {
    reply("/hub-api/v1/product/12679", {
      ok: true,
      data: { shop: null, produs: SUMMARY },
    });

    await getHubProduct({ by: "id", value: 12679 }, { withVariants: true });
    expect(new URL(requested[0]).searchParams.get("rude")).toBe("1");
  });
});

describe("getHubLiveOffers", () => {
  const live = (over: Record<string, unknown> = {}) => ({
    ok: true,
    data: {
      produse: [{ id: 12679, sku: "DEV-D3130C", pret: PRICE, stoc: STOCK }],
      lipsa: [],
      ...over,
    },
  });

  it("returns fresh price and stock, and what went missing", async () => {
    reply("/hub-api/v1/live", live({ lipsa: ["EOL-1", "EOL-2"] }));

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
      data: { shop: null, produs: SUMMARY },
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
    reply("/hub-api/v1/live", live({ lipsa: [12679, "EOL-1"] }));

    const result = await getHubLiveOffers({ ids: [12679] });
    expect(result.missing).toEqual(["12679", "EOL-1"]);
  });
});
