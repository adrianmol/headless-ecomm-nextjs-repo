/**
 * Minimal stand-in for the internal commerce API.
 *
 * TEMPORARY SCAFFOLDING. Delete this the moment the real API is reachable from
 * CI. It exists because `use cache` content is prerendered into the static
 * shell, so `next build` genuinely performs catalog requests — and there is no
 * backend yet. The alternatives were worse: weakening cacheLife so the catalog
 * stops prerendering, or swallowing fetch errors during build, which would hide
 * real outages behind an empty storefront.
 *
 * Responses intentionally mirror openapi/commerce.yaml. If this drifts from the
 * spec, the build stops exercising the real contract and becomes theatre.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_API_PORT ?? 4010);

const eur = (amountMinor) => ({ amountMinor, currency: "EUR" });

const products = [
  {
    id: "prod_1",
    slug: "merino-crew",
    title: "Merino Crew",
    description: "A mid-weight merino crew neck.",
    images: [
      {
        url: "https://cdn.test/merino-crew.jpg",
        alt: "Merino Crew",
        width: 800,
        height: 1000,
      },
    ],
    variants: [{ id: "var_1", title: "M" }],
  },
  {
    id: "prod_2",
    slug: "oxford-shirt",
    title: "Oxford Shirt",
    description: "Button-down oxford in brushed cotton.",
    images: [
      {
        url: "https://cdn.test/oxford-shirt.jpg",
        alt: "Oxford Shirt",
        width: 800,
        height: 1000,
      },
    ],
    variants: [{ id: "var_2", title: "L" }],
  },
];

const offers = {
  "merino-crew": {
    variantId: "var_1",
    price: eur(8900),
    compareAtPrice: eur(11900),
    availability: { inStock: true, quantity: 4 },
  },
  "oxford-shirt": {
    variantId: "var_2",
    price: eur(6500),
    availability: { inStock: false, quantity: 0 },
  },
};

const cart = {
  id: "cart_1",
  version: 1,
  lines: [],
  totals: { subtotal: eur(0), total: eur(0) },
};

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

const notFound = (res) =>
  json(res, 404, { code: "not_found", message: "not found" });

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/^\/v1/, "");

  if (req.method === "GET" && path === "/products") {
    return json(res, 200, { items: products, nextCursor: null });
  }

  let match = path.match(/^\/products\/([^/]+)\/offer$/);
  if (req.method === "GET" && match) {
    const offer = offers[match[1]];
    return offer ? json(res, 200, offer) : notFound(res);
  }

  match = path.match(/^\/products\/([^/]+)$/);
  if (req.method === "GET" && match) {
    const product = products.find((p) => p.slug === match[1]);
    return product ? json(res, 200, product) : notFound(res);
  }

  if (req.method === "POST" && path === "/carts") return json(res, 201, cart);
  if (req.method === "GET" && /^\/carts\/[^/]+$/.test(path)) {
    return json(res, 200, cart);
  }

  return notFound(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-api] listening on http://127.0.0.1:${PORT}/v1`);
});
