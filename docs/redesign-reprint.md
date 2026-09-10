# REPrint storefront — system design

**Status:** Implemented
**Last reviewed:** 2026-09-10
**Scope:** the consumables redesign only. The platform architecture it sits on is
unchanged and documented in [architecture.md](architecture.md).

## 1. What this is

A redesign of a Romanian printer-consumables shop (compatible toners, ink
cartridges, drum and fuser units, spare parts) on the existing headless
Next.js storefront.

The previous storefront was a generic apparel catalog. The redesign is not a
restyle: the catalog could not describe itself, so the contract was extended
first and the UI built on top of it. Rationale and trade-offs for the data model
are in [ADR-0004](adr/0004-consumables-domain-model.md).

**Decisions taken by the owner before implementation:**

| Decision   | Choice                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Locale     | Romanian only, prices in RON. No locale routing.                        |
| Data model | Extend `openapi/commerce.yaml`: consumables attributes + faceted search |
| B2B scope  | VAT-aware pricing, quantity tiers, printer finder, SEAP page            |
| Visual     | Clean technical utility — dense, scannable, information-first           |

## 2. The shape of the problem

A consumables catalog is not browsed, it is **searched against a constraint**.
Nobody wants to see twenty cartridges; they want the one that fits the machine
in front of them. Buyers arrive with one of two keys:

- a printer model — "Brother HL-2130"
- an OEM part code — "CB435A", "TN-2000"

and then compare on two numbers: **price** and **page yield** (effectively, cost
per page). Everything in the design follows from that.

```
                        ┌──────────────────────┐
   "I have a Brother"   │  Printer finder      │   "I need CB435A"
        ────────────►   │  brand → model       │   ◄────────────
                        └──────────┬───────────┘
                                   ▼
                    /compatibil/brother/hl-2130
                                   │
                      guaranteed-compatible listing
                       (facets · yield · stock · price)
                                   │
                                   ▼
                        PDP: specs, compatibility,
                        live price + VAT + tiers
```

## 3. Information architecture

| Route                         | Purpose                                  | Render  |
| ----------------------------- | ---------------------------------------- | ------- |
| `/`                           | Finder hero, category tiles, brand links | Static  |
| `/produse`                    | Full catalog, faceted                    | PPR     |
| `/produse/[slug]`             | Product detail                           | PPR     |
| `/categorii/[slug]`           | One consumable kind (tonere, cartuse, …) | PPR     |
| `/compatibil`                 | Finder landing                           | Static  |
| `/compatibil/[brand]`         | Everything fitting one printer brand     | PPR     |
| `/compatibil/[brand]/[model]` | **Everything fitting one printer**       | PPR     |
| `/info/seap`                  | Public-procurement information           | Static  |
| `/cos`, `/finalizare-comanda` | Cart, checkout                           | PPR     |
| `/comenzi/[id]`               | Order status                             | PPR     |
| `/api/compatibil`             | Finder form → canonical URL redirect     | Dynamic |

URLs are Romanian because the shop is. `/compatibil/[brand]/[model]` is the page
the whole design exists to deliver.

**One shared listing.** `/produse`, `/categorii/*` and `/compatibil/*` are the
same component (`app/(catalog)/_listing/product-listing.tsx`) with different
locked filters. A filter expressed by the route is applied but hidden from the
facet panel — offering to un-tick the category you are standing on would link to
a page contradicting its own heading.

## 4. The printer finder has no JavaScript

The obvious build is two dependent `<select>`s wired with JS that fetches models
when the brand changes: a client island on the homepage and every compatibility
page, plus a JSON endpoint to feed it.

Instead it is a plain `<form method="get">`:

```
homepage form ──GET──► /api/compatibil?brand=brother
                              │ 307
                              ▼
                     /compatibil/brother  ── renders the finder again,
                                             now with Brother's models
                              │
                     form ──GET──► /api/compatibil?brand=brother&model=hl-2130
                                             │ 307
                                             ▼
                              /compatibil/brother/hl-2130
```

Two steps, no fetch logic, no hydration, works with JavaScript disabled. The
handler is a redirect — it returns no catalog data and is never called by
script. The cost is one extra navigation to populate the model list, which is
the right trade for a control most visitors use once per session.

The same reasoning applies to the **facet panel**: plain links, so every filter
state is a real URL that is shareable, indexable and survives the back button.

**Result: the catalog pages ship no app-owned client JavaScript at all.** The
only client components are the cart and checkout leaves that were already there.

## 5. Caching and the price/stock split

Unchanged in principle from [architecture §5](architecture.md); the redesign
adds one pattern.

| Data                            | Strategy           | Tag            |
| ------------------------------- | ------------------ | -------------- |
| Product shell, listings, facets | `use cache`, hours | `product-list` |
| Product detail content          | `use cache`, days  | `product:slug` |
| Printer brands and models       | `use cache`, days  | `compat`       |
| **Price, VAT, tiers, stock**    | **never cached**   | —              |
| Cart, session, orders           | **never cached**   | —              |

Compatibility data gets its own tag so a routine price publish does not evict
the finder's dropdown data on every page.

**The listing price problem.** The grid is cached for hours and prices must
never be. Rendering price from the cached listing serves stale prices; fetching
one offer per card is N uncached round trips per page. So:

```
ProductListing
  ├─ await listProducts(filter)        cached — grid paints immediately
  └─ listOffers(slugs)   ← NOT awaited: one uncached batched request
        │
        ├─ <Suspense> CardPrice slug=a ─┐
        ├─ <Suspense> CardStock slug=a ─┤ every card awaits the SAME promise,
        ├─ <Suspense> CardPrice slug=b ─┤ so this is one network call for the
        └─ …                            ┘ whole grid
```

The PDP keeps its cached-shell/streamed-offer split, with one change: price,
VAT, tiers and stock stream in a **single** boundary. Splitting them would let
them arrive a frame apart and briefly show a combination the backend never
returned — "in stoc" beside a price since withdrawn.

## 6. Money

Integer minor units plus a currency code, as before. Two additions:

- **`priceExVat` and `vatRate` come from the backend.** The storefront derives
  neither, because applying a rate means multiplying money by a fraction, and
  `src/lib/money.ts` refuses that on purpose. See ADR-0004 §3.
- **`formatMoney` defaults to the storefront locale**, not `en-US`. This is a
  single-locale shop and an omitted argument used to render `RON 34.00` instead
  of `34,00 RON` — silently, on the cart, the checkout summary and the order
  confirmation. The correct output is now the one you get by forgetting.

Quantity tiers are display-only. What the customer is charged always comes from
the cart response.

## 7. Visual system

Clean technical utility: a restrained blue-grey ground with one strong blue
accent, so the only saturated things on the page are the ones that carry
meaning. A consumables catalog is dense — if the chrome competes with the data,
scanning for a part number gets slower.

Tokens are OKLCH, redefined in `globals.css` under the existing shadcn names so
primitives follow automatically. Three semantic additions: `stock-in`,
`stock-low`, `stock-out`, plus `promo`.

Card information order matches how these are bought — what it is, what it
replaces, how many pages, is it in stock, what it costs:

```
┌──────────────────────────┐
│ [Tonere]        [image]  │   kind badge, square (cartridges aren't portrait)
├──────────────────────────┤
│ Toner compatibil (2K)    │   title
│ HP 35A Black (CB435A)    │
│ CB435A · 35A             │   OEM codes — monospace, verbatim
│ 2.000 pagini             │   yield
│ G&G                      │   manufacturer
│                          │
│ ● In stoc                │   stock: dot + word, never colour alone
│ 34,00 RON                │   price
│ 28,10 RON fara TVA (21%) │   ex-VAT line, always present
└──────────────────────────┘
```

Two details that are easy to get wrong and were:

- **Diacritics.** Geist is loaded with `subsets: ["latin", "latin-ext"]`. The
  `latin` subset has no `ă â î ș ț`, so without this every product title falls
  back mid-word to a system font.
- **Monospace for part codes.** `CB435A` is compared character by character.
  A mono face keeps `0`/`O` and `1`/`l` apart.
- **Stock is never colour alone.** Each state pairs a dot with a word, because
  colour-only status fails WCAG 1.4.1 — and "is this available" is the question
  the badge exists to answer.

## 8. What was deliberately not built

Honesty about the storefront's own limits, not omissions to fix later:

- **No company address, phone, CUI, or registration number** in the footer, and
  **no SEAP contract numbers** on `/info/seap`. These are verifiable facts about
  a real legal entity; inventing plausible ones would publish false contact and
  procurement information on every page. They are owner-supplied content and
  belong in a CMS field.
- **No newsletter form.** There is no subscription endpoint in the contract, and
  a form that silently discards an email address is worse than no form.
- **No delivery-time, warranty, or provenance claims.** Nothing in the contract
  supports them, and for a real shop they carry legal exposure.
- **No basket count in the header.** Per-visitor data in a layout shared by
  every route would either drag a cart read into the cached catalog pages or
  require a global client store.

## 9. Verification

```bash
pnpm lint && pnpm codegen:check && pnpm typecheck && pnpm test && pnpm build:ci
pnpm e2e
```

Measured on this branch:

| Gate                     | Result                                  |
| ------------------------ | --------------------------------------- |
| Unit (Vitest)            | 159 passed                              |
| E2E (Playwright)         | 56 passed                               |
| Build                    | all 26 routes prerender as intended     |
| Client JS, worst route   | **151.5 kB gzipped** vs a 170 kB budget |
| Client JS, static routes | 144.4 kB gzipped                        |

The new pages add no client JavaScript, so the worst route is unchanged from the
pre-redesign PDP. Figures are gzipped transfer of all page JS excluding the
`noModule` polyfill bundle, which no modern browser downloads.

`PAGE_SIZE` is now **12**, replacing the `2` that
[next-steps.md §6](next-steps.md) flagged as a test artefact rather than a
product decision. With 17 fixture products that still yields a short terminal
page, so pagination and its layout-shift assertion stay exercised.

## 10. Backend requirements this adds

On top of [architecture §9](architecture.md), ranked by rework cost:

1. **Both VAT figures per offer**, plus tier prices already computed. The
   frontend cannot safely substitute for this.
2. **Faceted `/products`** with counts computed against the active filter.
3. **Batched `GET /offers?slugs=`**, or listings must choose between stale
   prices and one request per card.
4. **`/compat/brands` and `/compat/brands/{brand}/models`.**
5. The catalog-publish webhook must now also invalidate the `compat` tag.
