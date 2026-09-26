# headless-ecomm-flow — Frontend Architecture

**Status:** Accepted (draft implementation not started)
**Owner:** Frontend
**Last reviewed:** 2026-09-10

## Locked decisions

| Area               | Decision                                                         | ADR                                                  |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------- |
| Framework          | Next.js App Router, React Server Components                      | —                                                    |
| Topology           | Next.js acts as a BFF; internal API is not internet-facing       | [ADR-0001](adr/0001-nextjs-as-bff.md)                |
| Commerce backend   | Custom internal REST API described by an OpenAPI spec            | —                                                    |
| Cart ownership     | Backend-owned, server-authoritative                              | [ADR-0002](adr/0002-server-authoritative-cart.md)    |
| Runtime validation | Selective Zod at the API boundary, not blanket                   | [ADR-0003](adr/0003-selective-runtime-validation.md) |
| Auth               | Session cookie issued by the internal API, forwarded first-party | —                                                    |
| Payments           | Hosted redirect (PSP-hosted checkout)                            | —                                                    |
| Styling            | Tailwind + shadcn/ui                                             | —                                                    |
| Domain             | Printer consumables; faceted catalog, backend-supplied VAT       | [ADR-0004](adr/0004-consumables-domain-model.md)     |
| Locale             | Romanian only, RON. No locale routing.                           | [redesign-reprint.md](redesign-reprint.md)           |

## 1. Topology

The browser only ever talks to the Next.js origin. The internal commerce API stays on a
private network, and the session cookie is set first-party on our own domain.

```
Browser ──── httpOnly first-party cookie ────┐
   │                                         │
   │  RSC payload / Server Action POSTs      │
   ▼                                         ▼
┌──────────────────────────────────────────────────┐
│ Next.js (App Router)                             │
│  Server Components ── read paths                  │
│  Server Actions ───── write paths (cart, address) │
│  Route Handlers ───── PSP redirect return          │
│         │                                          │
│  ┌──────▼────────────────────────────────┐        │
│  │ Commerce Data Layer (server-only)      │        │
│  │  typed client · session forwarding     │        │
│  │  caching · error normalisation         │        │
│  └──────┬────────────────────────────────┘        │
└─────────┼──────────────────────────────────────────┘
          ▼ private network
   Internal Commerce API (OpenAPI)
          │
          ▼ server-to-server
   PSP (payment provider) ── webhooks ──► Internal API
```

Payment webhooks go to the **backend**, never to Next.js. Order fulfilment must not depend on
frontend availability. Rationale and rejected alternatives: [ADR-0001](adr/0001-nextjs-as-bff.md).

## 2. Module boundaries

```
src/
  app/                      # routing + composition ONLY, no business logic
    layout.tsx              # <html>/<body> only — no header or footer
    (shop)/                 # full header, menu and footer (shop/layout.tsx)
      (catalog)/
        _listing/product-listing.tsx  # shared faceted listing (private folder)
        produse/page.tsx              # PLP
        produse/[slug]/page.tsx       # PDP
        categorii/[slug]/page.tsx     # one consumable kind
        compatibil/[brand]/[model]/   # consumables fitting one printer
      cos/page.tsx          # basket keeps the menu: "keep shopping" is valid
    (checkout)/             # minimal frame: logo + help phone, no menu
      finalizare-comanda/page.tsx
      comenzi/[id]/page.tsx # order confirmation
      finalizare-comanda/return/route.ts   # PSP return handler
  commerce/                 # the data layer
    client.ts               # typed client factory, `import 'server-only'`
    session.ts              # cookie read / forward / set
    cart/                   # queries + mutations + schemas
    catalog/
    checkout/
    errors.ts               # API error -> domain error normalisation
  components/
    ui/                     # shadcn primitives, zero domain knowledge
    commerce/               # ProductCard, CartLine, PriceDisplay
  lib/                      # money, formatting, env parsing
```

Two boundaries are enforced mechanically, because these are the ones that erode under delivery
pressure:

1. **`components/**` may not import from `commerce/**`.** Components take plain props. Enforced with
   an ESLint boundary rule. Keeps the UI layer testable without mocking HTTP.
2. **`commerce/client.ts` carries `import 'server-only'`.** A build error is the only reliable way to
   stop an API base URL or session token reaching a client bundle.

## 3. API access and type safety

- `openapi-typescript` generates types from the spec; `openapi-fetch` (~6 kB) is the client.
- Generated output is **committed**, so a backend spec change appears as a reviewable diff instead of
  a silent runtime break. CI regenerates and fails on drift.
- OpenAPI types are a compile-time _claim_ about the backend, not a runtime guarantee. Runtime
  validation is applied selectively — see [ADR-0003](adr/0003-selective-runtime-validation.md).
- **Money is never a `number`.** Minor units as integers plus a currency code; formatted at the edge
  with `Intl.NumberFormat`. Float arithmetic on prices is the most common bug class in commerce
  frontends.

## 4. Cart

Reads happen in Server Components. Writes go through Server Actions, which are the only code allowed
to mutate.

```
addToCart(variantId, qty)  -- Server Action
  |- ensure cart exists (create + set cookie if absent)
  |- POST /carts/{id}/lines   (Idempotency-Key)
  |- revalidateTag(`cart:${id}`)
  \- return normalised result | typed domain error
```

Design constraints that follow from the platform:

- **Cookies cannot be set during Server Component render.** A cart therefore cannot be lazily created
  while rendering a page. Cart creation happens in a Server Action on first add-to-cart — which also
  avoids orphaned empty carts inflating abandonment metrics.
- Perceived latency is covered by `useOptimistic` in thin client islands (cart badge, quantity
  stepper). **Optimistic totals are display-only.** The server response is the only truth for any
  figure the customer is charged.
- Quantity steppers debounce and coalesce, otherwise a held `+` button produces a request storm with
  racing responses.

## 5. Caching

Uniform caching is how commerce sites ship stale prices. Split data by ownership:

| Data                       | Strategy                        | Invalidation                  |
| -------------------------- | ------------------------------- | ----------------------------- |
| Product / category content | Cached, long TTL                | Tag-based, on backend publish |
| Price and availability     | Short TTL (seconds) or uncached | Time-based                    |
| Cart, session, orders      | **Never cached**                | n/a                           |
| Search / facets            | Cached by query params          | Time-based                    |

Since Next.js 15, `fetch` is no longer cached by default; caching is opt-in, which is the correct
default here. Prefer the framework's explicit cache primitives (`use cache` with `cacheTag` /
`cacheLife` where stable, otherwise tagged `unstable_cache`) rather than a bespoke cache layer.

**PDP pattern:** the shell (title, images, description, SEO metadata) is cached and streams
immediately; price and stock render inside `<Suspense>` from a fresh fetch. This yields static-page
first paint without ever displaying a stale price. The skeleton must reserve the exact final height,
or the price swap costs CLS.

Requires a cache-invalidation webhook from the backend into `revalidateTag`. Without it the only
choices are stale catalog or no catalog caching.

## 6. Session

- API session cookie is set on our origin, `httpOnly`, `Secure`, `SameSite=Lax`.
- `Lax` rather than `Strict` **deliberately**: the PSP return is a cross-site top-level navigation, and
  `Strict` would drop the cookie and lose the session on return from payment.
- Never make authorisation decisions in middleware. Middleware runs on every request including
  prefetches; treat it as routing only. Authorisation belongs next to the data fetch.
- Guest and authenticated carts merge on login. Merge semantics (sum quantities, re-validate stock)
  are **backend-owned** so both clients behave identically.

## 7. Checkout

Frontend responsibility ends at "create order intent, redirect".

1. Collect address and shipping via Server-Action-driven forms. Zod-validate client-side for UX, then
   let the backend re-validate for enforcement.
2. `POST /checkout/sessions` with an idempotency key derived from cart id + version. Double-clicking
   "Pay" must not create two orders.
3. Redirect to the PSP URL.
4. On return, `checkout/return/route.ts` **treats all query parameters as untrusted** and re-fetches
   order status from our backend. A return URL is attacker-controlled; trusting `?status=success` is
   how you ship free products.
5. If status is still pending (webhook not yet landed), show a polling "confirming payment" state —
   never assert success or failure.

Confirmation pages are non-cacheable and `noindex`.

## 8. Non-functional requirements

**Performance budgets**, enforced in CI via Lighthouse CI on PLP and PDP:

| Metric            | Budget                                           |
| ----------------- | ------------------------------------------------ |
| LCP (PDP)         | < 2.0 s                                          |
| CLS               | < 0.05                                           |
| Initial client JS | < 170 kB gzipped (transfer, `noModule` excluded) |

Numbers are written down because RSC apps degrade gradually: one misplaced `'use client'` ships the
whole subtree to the browser. Budgets catch that; code review reliably does not. Client components
stay leaves — add-to-cart button, quantity stepper, gallery, filter panel — never layouts.

**On the JS number.** It was originally 120 kB, set before anything was built. That turned out to be
below the floor: measured on the production build, `/` — a route with _no_ client components at all —
already ships 131 kB. React 19 plus the Next 16 App Router runtime costs that before we write a line.
The budget was unmeetable, and a permanently-red budget is a budget everyone learns to ignore.

170 kB is the measured worst page (PDP, 152 kB) plus modest headroom. What it protects is the thing
worth protecting: a misplaced `'use client'` on a layout adds hundreds of kB and blows straight
through it.

Measured app-owned JS, i.e. everything above the 131 kB framework floor:

Measured 2026-09-10 on the consumables build, as gzipped transfer of all page JS:

| Route                         | Total    |
| ----------------------------- | -------- |
| `/`, `/compatibil`, `/cos`    | 144.4 kB |
| `/produse`                    | 151.5 kB |
| `/produse/[slug]`             | 151.5 kB |
| `/compatibil/[brand]/[model]` | 151.5 kB |

The catalog redesign added no client JavaScript: the printer finder and the facet panel are plain
forms and links rather than islands, so the worst route is unchanged from the pre-redesign PDP even
though there are now four more catalog route families.

When re-measuring, exclude `<script noModule>`: that is the legacy polyfill bundle (~39 kB) and no
modern browser downloads it. Counting it inflates every figure by a third.

**Errors.** Normalise API failures into a domain union at the data layer: `OutOfStock`,
`PriceChanged`, `CartExpired`, `Unavailable`. UI switches on the union. `PriceChanged` needs a real
designed flow: the customer must see and accept the new price, never be silently charged it.

**Observability.** OpenTelemetry with trace context propagated Next -> API, so a slow PDP can be
attributed to a specific backend call. Frontend RUM for field Core Web Vitals. Alert on add-to-cart
and checkout-start error rates; those are the revenue-critical funnel steps.

**Testing**, weighted by risk rather than pyramid orthodoxy:

- Unit — money math, cart reducers, error normalisation
- Integration — Server Actions against MSW mocks seeded from the OpenAPI spec
- Contract — spec-drift check in CI
- E2E (Playwright) — browse -> cart -> checkout -> redirect stub, plus out-of-stock and price-changed
- Accessibility — axe on PLP/PDP/cart; commerce carries real legal exposure

## 9. Backend contract requirements

Ranked by rework cost if they arrive late:

1. **Idempotency keys on all mutations.** Without them, double submits create duplicate orders and
   there is no frontend-only fix.
2. **Cache-invalidation webhook.** Without it, catalog caching is unsafe.
3. **Structured machine-readable error codes**, not prose messages. Without them the UI cannot
   distinguish out-of-stock from a server fault.
4. **Cart merge semantics on login**, backend-owned.
5. **A latency budget for the API.** Next.js adds a hop; if PDP data takes 800 ms server-side, no
   amount of frontend work reaches a 2 s LCP.

Security note: pin Next.js `>= 16.3.4`. The August 2026 release addressed two critical-severity
vulnerabilities.

## 10. Open questions

- Is search/faceting a separate service, or does the same REST API handle filtering? Affects caching
  keys and route design.
- Multi-currency / multi-region? Retrofitting locale-aware routing is expensive.

## 11. Build plan

| Phase | Deliverable                                                                           | Exit criteria                           |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| 0     | Scaffold, Tailwind + shadcn, ESLint boundary rules, CI                                | typecheck + lint + budgets green        |
| 1     | Data layer: codegen, typed client, session forwarding, error normalisation, MSW mocks | data layer usable with no real backend  |
| 2     | Catalog: PLP + PDP, caching, streamed price/stock                                     | LCP budget met                          |
| 3     | Cart: Server Actions, optimistic UI, merge on login                                   | concurrency + stock-conflict tests pass |
| 4     | Checkout: forms, idempotent session creation, redirect, return verification           | E2E green against PSP test mode         |
| 5     | Hardening: a11y, observability, error flows, load test                                | budgets + axe clean in CI               |

Phase 1 precedes phase 2 deliberately: with spec-driven MSW mocks, catalog and cart work proceed in
parallel with backend development, and the §9 contract gaps surface in week one rather than week six.
