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
  {
    id: "prod_3",
    slug: "linen-shirt",
    title: "Linen Shirt",
    description: "A breezy linen button-down.",
    images: [
      {
        url: "/img/merino-crew.png",
        alt: "Linen Shirt",
        width: 800,
        height: 1000,
      },
    ],
    variants: [{ id: "var_3", title: "M" }],
  },
  {
    id: "prod_4",
    slug: "cotton-tee",
    title: "Cotton Tee",
    description: "A soft jersey t-shirt.",
    images: [
      {
        url: "/img/oxford-shirt.png",
        alt: "Cotton Tee",
        width: 800,
        height: 1000,
      },
    ],
    variants: [{ id: "var_4", title: "L" }],
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
  "linen-shirt": {
    variantId: "var_3",
    price: eur(7200),
    availability: { inStock: true, quantity: 3 },
  },
  "cotton-tee": {
    variantId: "var_4",
    price: eur(4500),
    availability: { inStock: true, quantity: 6 },
  },
};

const cart = {
  id: "cart_1",
  version: 1,
  lines: [],
  totals: { subtotal: eur(0), total: eur(0) },
};

/** One cart is enough for a stand-in; the storefront only ever holds one id. */
let lineSeq = 0;

function offerForVariant(variantId) {
  const product = products.find((p) =>
    p.variants.some((v) => v.id === variantId),
  );
  if (!product) return null;
  return { product, offer: offers[product.slug] };
}

/** Totals are derived, never sent by the client — the backend owns the money. */
function recalcTotals() {
  const subtotal = cart.lines.reduce(
    (sum, l) => sum + l.lineTotal.amountMinor,
    0,
  );
  cart.totals = { subtotal: eur(subtotal), total: eur(subtotal) };
}

function commit() {
  recalcTotals();
  cart.version += 1;
  return structuredClone(cart);
}

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
const cartsByKey = new Map();
const cartMutationsByKey = new Map();

const readJsonBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
  });

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

/**
 * Test-only fault injection. Not part of the commerce API.
 *
 * The product resolves normally but its live offer returns 500, which is a real
 * degraded-backend shape: the cached shell is fine while request-time pricing is
 * unavailable. It exists so E2E can prove the route error boundary renders
 * something useful instead of a blank page — the one thing that is otherwise
 * only verifiable by breaking production.
 */
const FAULT_SLUG = "force-error";

const faultProduct = {
  id: "prod_fault",
  slug: FAULT_SLUG,
  title: "Fault Injection",
  description: "Test fixture whose live offer always fails.",
  images: [
    {
      url: "/img/merino-crew.png",
      alt: "Fault Injection",
      width: 800,
      height: 1000,
    },
  ],
  variants: [{ id: "var_fault", title: "One size" }],
};

const conflict = (res, code, message, details) =>
  json(res, 409, { code, message, ...(details ? { details } : {}) });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/^\/v1/, "");

  // Test-only. Not part of the commerce API and not something the real backend
  // will ever expose. E2E needs it because the cart here is a single global
  // object and the idempotency caches are keyed on values the client derives
  // from useId, which can legitimately repeat between tests — without a reset,
  // one test's basket leaks into the next.
  if (req.method === "POST" && url.pathname === "/__reset") {
    cart.lines = [];
    cart.version = 1;
    lineSeq = 0;
    recalcTotals();
    cartsByKey.clear();
    cartMutationsByKey.clear();
    sessionsByKey.clear();
    orders.clear();
    return json(res, 200, { reset: true });
  }

  if (req.method === "GET" && path === "/products") {
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");
    const limit =
      limitParam === null
        ? 24
        : Number(limitParam);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return json(res, 400, {
        code: "validation_failed",
        message: "invalid limit",
        details: { field: "limit" },
      });
    }

    let start = 0;
    if (cursor !== null) {
      const idx = products.findIndex((p) => p.id === cursor);
      if (idx === -1) {
        return json(res, 400, {
          code: "validation_failed",
          message: "invalid cursor",
          details: { field: "cursor" },
        });
      }
      start = idx + 1;
    }

    const items = products.slice(start, start + limit);
    const nextCursor =
      items.length > 0 && start + items.length < products.length
        ? items[items.length - 1].id
        : null;

    return json(res, 200, { items, nextCursor });
  }

  let match = path.match(/^\/products\/([^/]+)\/offer$/);
  if (req.method === "GET" && match) {
    if (match[1] === FAULT_SLUG) {
      return json(res, 500, { code: "unavailable", message: "injected fault" });
    }
    const offer = offers[match[1]];
    return offer ? json(res, 200, offer) : notFound(res);
  }

  match = path.match(/^\/products\/([^/]+)$/);
  if (req.method === "GET" && match) {
    if (match[1] === FAULT_SLUG) return json(res, 200, faultProduct);
    const product = products.find((p) => p.slug === match[1]);
    return product ? json(res, 200, product) : notFound(res);
  }

  if (req.method === "POST" && path === "/carts") {
    // A new cart is empty. Keyed on Idempotency-Key so a double-clicked first
    // add-to-cart yields one cart, which is the behaviour the spec requires.
    const created = idempotent(
      cartsByKey,
      req.headers["idempotency-key"],
      () => {
        cart.lines = [];
        cart.version = 1;
        lineSeq = 0;
        recalcTotals();
        return structuredClone(cart);
      },
    );
    return json(res, 201, created);
  }

  match = path.match(/^\/carts\/([^/]+)$/);
  if (req.method === "GET" && match) {
    return match[1] === cart.id ? json(res, 200, cart) : notFound(res);
  }

  match = path.match(/^\/carts\/([^/]+)\/lines$/);
  if (req.method === "POST" && match) {
    if (match[1] !== cart.id) return notFound(res);

    const key = req.headers["idempotency-key"];
    if (key && cartMutationsByKey.has(key)) {
      return json(res, 200, cartMutationsByKey.get(key));
    }

    const body = await readJsonBody(req);
    const found = offerForVariant(body.variantId);
    if (!found) return notFound(res);

    const quantity = Number(body.quantity ?? 1);
    const existing = cart.lines.find((l) => l.variantId === body.variantId);
    const wanted = (existing?.quantity ?? 0) + quantity;
    const available = found.offer?.availability.quantity ?? 0;
    if (wanted > available) {
      return conflict(res, "out_of_stock", "insufficient stock", {
        variantId: body.variantId,
        available,
      });
    }

    if (existing) {
      existing.quantity = wanted;
      existing.lineTotal = eur(existing.unitPrice.amountMinor * wanted);
    } else {
      const unitPrice = found.offer.price;
      cart.lines.push({
        id: `line_${++lineSeq}`,
        variantId: body.variantId,
        title: found.product.title,
        image: found.product.images[0],
        quantity,
        unitPrice,
        lineTotal: eur(unitPrice.amountMinor * quantity),
      });
    }

    const snapshot = commit();
    if (key) cartMutationsByKey.set(key, snapshot);
    return json(res, 200, snapshot);
  }

  match = path.match(/^\/carts\/([^/]+)\/lines\/([^/]+)$/);
  if ((req.method === "PATCH" || req.method === "DELETE") && match) {
    if (match[1] !== cart.id) return notFound(res);

    const key = req.headers["idempotency-key"];
    if (key && cartMutationsByKey.has(key)) {
      return json(res, 200, cartMutationsByKey.get(key));
    }

    const line = cart.lines.find((l) => l.id === match[2]);
    if (!line) return notFound(res);

    // Absolute quantity, never a delta; 0 removes the line.
    const quantity =
      req.method === "DELETE"
        ? 0
        : Number((await readJsonBody(req)).quantity ?? 0);

    if (quantity > 0) {
      const available =
        offerForVariant(line.variantId)?.offer?.availability.quantity ?? 0;
      if (quantity > available) {
        return conflict(res, "out_of_stock", "insufficient stock", {
          variantId: line.variantId,
          available,
        });
      }
      line.quantity = quantity;
      line.lineTotal = eur(line.unitPrice.amountMinor * quantity);
    } else {
      cart.lines = cart.lines.filter((l) => l.id !== line.id);
    }

    const snapshot = commit();
    if (key) cartMutationsByKey.set(key, snapshot);
    return json(res, 200, snapshot);
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
