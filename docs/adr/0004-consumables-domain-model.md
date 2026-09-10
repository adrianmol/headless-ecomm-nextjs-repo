# ADR-0004: Consumables domain model, VAT and quantity tiers

**Status:** Accepted
**Date:** 2026-09-10
**Supersedes:** nothing
**Related:** [ADR-0003](0003-selective-runtime-validation.md), [architecture §5](../architecture.md)

## Context

The storefront was rebuilt around a Romanian printer-consumables catalog
(REPrint). The previous `Product` schema carried `id`, `slug`, `title`,
`description`, `images` and `variants` — enough for apparel, and nothing else.

Consumables are not bought that way. A shopper arrives holding a printer model
("Brother HL-2130") or an OEM part code ("CB435A") and needs the item that fits,
its rated page yield, and whether it is in stock. None of that could be
expressed, and `GET /products` supported only cursor paging — no filtering by
printer, no facets. A visual redesign over that model would have produced a shop
unable to describe its own catalog.

Two further requirements come from selling in Romania to businesses:

- Business buyers compare **ex-VAT** prices; consumers need the inclusive one.
  The ex-VAT figure is also what appears on the invoice.
- Offices buy toner by the box, so **quantity price breaks** are normal.

`openapi/commerce.yaml` describes itself as "a proposal to the backend team, not
a description of a shipped service", so extending it is its intended use.

## Decision

### 1. Model consumables explicitly

`Product` gains `kind` (toner, inkjet, drum, fuser, waste, roller, other),
`attributes` (colour, `yieldPages`, `oemCodes`, `manufacturer`, `isOriginal`)
and `compatibility` — printer brands each with the models this item fits.

`isOriginal` is supplied by the backend and **never inferred from the title**.
Whether an item is genuine OEM stock or a compatible equivalent is a
consumer-protection fact, not a display detail; guessing it from a product name
would eventually mislabel one.

### 2. Facets on `/products`, not a separate search service

`GET /products` accepts `brand`, `model`, `kind`, `manufacturer`, `color`,
`inStock` and `sort`, and returns `facets` with counts computed against the
current filter. This answers the open question in architecture §10.

Facet **labels come from the backend**, not a local code-to-prose map: the set
of brands and manufacturers grows with the catalog, and a local map would
silently render new values as raw slugs. The one exception is the category
taxonomy in `src/lib/catalog-taxonomy.ts`, which owns the `/categorii/*` URLs —
a URL is a permanent public contract and a navigation decision, so it should not
change because someone edited a backend label.

### 3. The backend supplies both VAT figures. The storefront derives neither.

`Offer` carries `price` (inclusive), `priceExVat`, and `vatRate` in basis
points. `PriceTier.unitPrice` likewise arrives already computed.

This is the load-bearing decision in this ADR. Deriving one price from the other
means multiplying money by a fraction, and `src/lib/money.ts` refuses fractional
multipliers on purpose — a VAT rate needs a rounding policy, and that policy is
fiscal, not presentational. A half-cent of rounding drift at the render edge is
a discrepancy against an invoice, not a cosmetic bug. `vatRate` is carried for
display and invoicing only; it is not there so the client can do the arithmetic.

The offer schema is validated at runtime (per ADR-0003) because every field in
it is charged or invoiced.

### 4. Quantity tiers are display-only

`priceTiers` renders a table on the PDP. Nothing re-applies a tier client-side,
and no total shown anywhere is derived from one. What the customer is charged
comes from the cart response, computed by the backend against the quantity
actually ordered — the same rule as optimistic cart totals (architecture §4).
A stale tier that quoted a price checkout then refused would be worse than
showing no tiers at all.

### 5. A batched `/offers` endpoint for listings

The product grid is cached for hours; prices must never be. Rendering a price
per card from the cached listing would serve stale prices, and fetching one
offer per card would mean N uncached round trips per page.

`GET /offers?slugs=a,b,c` returns live offers for a whole page in one call. The
listing renders instantly from cache and every card's price streams into it from
that single request, behind its own `<Suspense>` boundary. Unknown slugs are
omitted rather than erroring: a product deleted between the cached listing and
this call is an ordinary race and must not blank the prices of the whole grid.

Responses pair each offer with its slug explicitly rather than positionally,
because an index-based mapping over a response that can omit entries would
silently attach prices to the wrong products.

## Consequences

**Good**

- The catalog can be navigated the way it is actually shopped: by printer.
- Prices are correct by construction — there is no code path that can compute a
  VAT figure, so there is none that can round one wrongly.
- Listings stay cacheable while showing live prices, at one extra request per
  page rather than one per product.
- The facet panel is plain links, so filtered listings are shareable, indexable,
  survive the back button, and cost zero client JavaScript.

**Bad / accepted**

- The backend must now compute and return two prices per offer plus tier
  pricing. This is real backend work, and it is deliberately not optional: the
  frontend cannot safely substitute for it.
- Facet counts must be computed per filter, which is more expensive than an
  unfiltered listing.
- `/compat/brands` and `/compat/brands/{brand}/models` are two more endpoints to
  implement, though both are small and near-static.

**Unresolved**

- Multi-currency and multi-region remain open (architecture §10). This ADR
  assumes one locale and one VAT rate per offer; a second market would need the
  rate to vary per shipping destination, which is a backend concern again.
- The catalog-publish webhook (architecture §9) now also needs to invalidate the
  `compat` tag when a product line is added.
