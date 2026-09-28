/**
 * Stand-in for the HUB catalogue endpoints the session cart uses, plus a sink
 * for the order email. Served by scripts/mock-api.mjs; same caveat — delete
 * once CI can reach the real services.
 *
 * What the cart, checkout, product page and collection page touch: product by
 * sku or slug (with the other mock product as its sibling), `live`, and a
 * three-node category tree — brand, family, printer — holding both products.
 * Signatures are not verified; that is covered by src/commerce/hub/client.test.ts.
 */

const price = (value) => ({
  value,
  special: null,
  currency: "RON",
  tax_included: true,
  show: true,
});

const stock = (orderable, quantity) => ({
  state: orderable ? "stoc" : "nostoc",
  label: orderable ? "In stoc" : "Stoc epuizat",
  orderable,
  quantity,
});

export const hubProducts = [
  {
    id: 9001,
    sku: "HUB-TONER-1",
    url: "toner-hub-test-negru",
    name: "Toner HUB test negru",
    price: price(66),
    stock: stock(true, 3),
  },
  {
    id: 9002,
    sku: "HUB-TONER-GONE",
    url: "toner-hub-test-epuizat",
    name: "Toner HUB test epuizat",
    price: price(40),
    stock: stock(false, 0),
  },
].map((p) => ({
  ...p,
  image: null,
  brand: "HP",
  manufacturer: "Test",
  type: "toner",
  is_pack: false,
  // Detail-only fields. 66 RON over 2.000 pages is 3,30 bani a page.
  capacity: "2000",
  color: "Black (BK)",
  oem: "HP:CF283A",
  ean: "4960999681986",
  categories: [9101, 9102],
}));

const category = (id, parent, name, kind) => ({
  id,
  parent,
  name,
  url: "",
  kind,
  title: name,
  image: null,
  meta: { title: "", description: "" },
});

export const hubCategories = [
  category(9100, 0, "HP", "brand"),
  category(9101, 9100, "HP 83A", "family"),
  category(9102, 9100, "LaserJet Pro M127fn", "prn"),
];

/** Order emails received, newest last. Cleared by `/__reset`. */
export const sentEmails = [];

const ok = (data) => ({ ok: true, data });
const notFoundBody = { ok: false, error: { code: "not_found" } };

/** Returns true when it handled the request. */
export function handleHub(req, url, body, json) {
  if (url.pathname === "/__email") {
    if (req.method === "POST") {
      sentEmails.push(body);
      json(200, { id: `email_${sentEmails.length}` });
    } else {
      json(200, sentEmails);
    }
    return true;
  }

  if (!url.pathname.startsWith("/hub-api/v1/")) return false;
  const path = url.pathname.slice("/hub-api/v1".length);

  if (path === "/live") {
    const skus = (url.searchParams.get("skus") ?? "").split(",");
    const found = hubProducts.filter((p) => skus.includes(p.sku));
    json(
      200,
      ok({
        products: found.map(({ id, sku, price, stock }) => ({
          id,
          sku,
          price,
          stock,
        })),
        missing: skus.filter((sku) => !found.some((p) => p.sku === sku)),
      }),
    );
    return true;
  }

  if (path === "/category") {
    const counted = url.searchParams.get("count") === "1";
    json(
      200,
      ok({
        shop: null,
        categories: hubCategories.map((c) =>
          // Absent unless counted, as upstream: absent is not zero.
          counted
            ? { ...c, products: c.kind === "brand" ? 0 : hubProducts.length }
            : c,
        ),
      }),
    );
    return true;
  }

  const byCategory = path.match(/^\/category\/(\d+)$/);
  if (byCategory) {
    const found = hubCategories.find((c) => c.id === Number(byCategory[1]));
    const products = found && found.kind !== "brand" ? hubProducts : [];
    if (!found) json(404, notFoundBody);
    else
      json(
        200,
        ok({
          shop: null,
          category: { ...found, products: products.length },
          children: hubCategories.filter((c) => c.parent === found.id),
          products,
          pagination: {
            page: 1,
            per_page: 100,
            total: products.length,
            pages: products.length ? 1 : 0,
          },
        }),
      );
    return true;
  }

  const bySku = path.match(/^\/product\/([^/]+)$/);
  const key = bySku ? decodeURIComponent(bySku[1]) : null;
  const slug = path === "/product" ? url.searchParams.get("url") : null;
  if (key !== null || slug !== null) {
    const product = hubProducts.find((p) =>
      // Upstream resolves a sku without regard to case; measured 2026-09-28.
      key !== null ? p.sku.toLowerCase() === key.toLowerCase() : p.url === slug,
    );
    // Each product lists the other as a sibling, so a product page renders a
    // HUB card grid — the only way the e2e suite reaches a card's add-to-cart.
    const related = hubProducts.filter((p) => p !== product);
    if (!product) json(404, notFoundBody);
    else json(200, ok({ shop: null, product, related, components: [] }));
    return true;
  }

  json(404, notFoundBody);
  return true;
}
