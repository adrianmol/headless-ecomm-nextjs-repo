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
        url: "/img/merino-crew.png",
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
        url: "/img/oxford-shirt.png",
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

// Where the stand-in payment page sends the shopper back to. Overridable
// because the storefront port varies between dev and `next start`.
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? "http://localhost:3000";

/**
 * Stand-in for the payment provider, so the full redirect round trip can be
 * exercised: create session -> leave the site -> come back -> poll -> confirm.
 *
 * Orders start `pending` and flip to `paid` after PENDING_MS, which is what
 * makes the confirming screen's polling path reachable at all. Without it the
 * webhook race is invisible in development and only shows up in production.
 */
const PENDING_MS = Number(process.env.MOCK_PENDING_MS ?? 4000);
const orders = new Map();

function idempotent(map, key, create) {
  if (key && map.has(key)) return map.get(key);
  const value = create();
  if (key) map.set(key, value);
  return value;
}
const sessionsByKey = new Map();

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

  if (req.method === "POST" && path === "/checkout/sessions") {
    // Honours Idempotency-Key the way the spec requires, so a double-clicked
    // Pay button demonstrably produces one order rather than two.
    const key = req.headers["idempotency-key"];
    const session = idempotent(sessionsByKey, key, () => {
      const orderRef = `ord_${Math.random().toString(36).slice(2, 10)}`;
      orders.set(orderRef, { id: orderRef, paidAt: Date.now() + PENDING_MS });
      return {
        orderRef,
        redirectUrl: `http://127.0.0.1:${PORT}/psp/pay?ref=${orderRef}`,
      };
    });
    return json(res, 201, session);
  }

  const orderMatch = path.match(/^\/orders\/([^/]+)$/);
  if (req.method === "GET" && orderMatch) {
    const order = orders.get(orderMatch[1]);
    if (!order) return notFound(res);
    return json(res, 200, {
      id: order.id,
      status: order.cancelled
        ? "failed"
        : Date.now() >= order.paidAt
          ? "paid"
          : "pending",
      total: eur(8900),
    });
  }

  // --- stand-in hosted payment page (NOT part of the commerce API) ----------
  if (req.method === "GET" && url.pathname === "/psp/pay") {
    const ref = url.searchParams.get("ref") ?? "";
    const back = `${STOREFRONT_URL}/checkout/return?ref=${encodeURIComponent(ref)}`;
    const html = `<!doctype html><meta charset="utf-8"><title>Mock payment provider</title>
<body style="font-family:system-ui;max-width:34rem;margin:4rem auto">
<h1>Mock payment provider</h1>
<p>Standing in for the hosted PSP. Order <code>${ref}</code>.</p>
<p>Payment settles ${PENDING_MS}ms after the session was created, so returning
immediately exercises the <em>pending</em> path.</p>
<p><a href="${back}">Pay and return</a></p>
<p><a href="${back}&status=success&amount=1">Return with forged success params</a>
&mdash; the storefront must ignore these and ask its own backend.</p>
<p><a href="/psp/cancel?ref=${encodeURIComponent(ref)}">Cancel payment</a></p>
</body>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && url.pathname === "/psp/cancel") {
    const ref = url.searchParams.get("ref") ?? "";
    const order = orders.get(ref);
    if (order) order.cancelled = true;
    res.writeHead(302, {
      location: `${STOREFRONT_URL}/checkout/return?ref=${encodeURIComponent(ref)}`,
    });
    return res.end();
  }

  return notFound(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-api] listening on http://127.0.0.1:${PORT}/v1`);
});
