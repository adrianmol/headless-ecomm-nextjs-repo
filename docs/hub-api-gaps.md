# HUB API — what the storefront plan needs and the contract does not have

**Compared on 2026-09-28:** [the plan](nodejs-reprint.en.md) against
[the HUB contract](../openapi/hub.yaml) (`hub.reprint.ro/docs/openapi.yaml`, version 1.0.0).
Both are saved in this repository exactly as downloaded, so a later download can be diffed.

The contract today has five catalogue routes — `ping`, `live`, `category`, `category/{id}`,
`product/{id}` — and the PrestaShop integration routes. Everything below is missing. Nothing
here is built in the storefront as a substitute: a price, a stock figure or a customer record
that the storefront invents is worse than a feature that is absent.

Route names are proposals. Field names follow the contract's existing English spelling.

## How to read the priority

| Mark  | Meaning                                                                             |
| ----- | ----------------------------------------------------------------------------------- |
| **A** | Small change to a route that already exists. Unblocks a page that is already built. |
| **B** | New read-only route. Unblocks a page with no customer data involved.                |
| **C** | Needs accounts or orders in HUB (plan stage 1) before it can exist.                 |

---

## 1. Fields missing from routes that already exist — priority A

These are the cheapest and unblock the most. The data exists in HUB already: every field
below is present on `product/{id}` and only absent from the list form.

### 1.1 `ProdusScurt` (category listings, `related`, `components`)

| Field        | Why the storefront needs it                                                                    | Where it is today                                                |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `color`      | The collection table's first column, and the fixed colour order (black, cyan, magenta, yellow) | `product/{id}` only                                              |
| `capacity`   | The yield column, and **cost per page** — the figure buyers compare on                         | `product/{id}` only                                              |
| `quality`    | The Original / Premium / Economic selector                                                     | Only as the `Calitate` entry inside `features` on `product/{id}` |
| `group`      | Ordering groups: Consumables → Refill materials → Equipment maintenance                        | Only as `Categorie de produs` inside `features`                  |
| `offer_code` | Folding the other manufacturers of one consumable under "alte 3 ▾"                             | `product/{id}` only                                              |
| `oem`        | Showing the OEM code on a row, and matching a searched code                                    | `product/{id}` only                                              |

**What this blocks today.** The collection page (`/categorii-hub/…`) groups by product type
and shows name, manufacturer, price and stock. It cannot show colour, yield or cost per page,
cannot offer the quality selector, and cannot fold variants. The alternative — one
`product/{id}` request per row — is 131 requests for the best-covered printer, against a
limit of 600 a minute.

### 1.2 `ProdusComplet` (`product/{id}`)

| Field                                                | Plan reference                                       | Note                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `quality`                                            | 3.3 variants strip, comparison table                 | Today parsed from `features`, by a Romanian label that may change                                                      |
| `lowest_price_30d`                                   | 3.3 "Cel mai mic preț din ultimele 30 de zile"       | Omnibus. Needs the price history kept out of the automatic cleanup                                                     |
| `price.tiers[]` — `{ min_qty, value }`               | 3.3 "1 buc 171 lei · 2 buc 165 lei · 4+ buc 158 lei" | Must be computed in HUB; the storefront never multiplies a price by a fraction                                         |
| `price.tax_rate` or `price.value_ex_vat`             | Ex-VAT line for companies                            | Without it the line is omitted, not estimated                                                                          |
| `stock.own_quantity`                                 | 3.3 "În stoc: 7 buc"                                 | Exact figure **only** when own stock is below 10, otherwise absent. `stock.quantity` is a threshold today (50/30/20/0) |
| `stock.delivery_estimate`                            | 3.3 "Primești joi"                                   | A date or a day range; depends on stock state and cut-off hour                                                         |
| `recommended`                                        | 3.3 "Recomandat REPrint" badge                       | One per group (OEM code + colour + quality)                                                                            |
| `has_seal`                                           | 3.3 and stage 10, the seal notice before purchase    |                                                                                                                        |
| `in_bundles[]` — `{ sku, url, name, price, saving }` | 3.3 "Cumpără inteligent"                             | `components` lists what a bundle contains; the reverse is missing                                                      |
| `quality_alternatives[]`                             | 3.3 "Vezi și: Original 409 lei · Economic 132 lei"   | `related` returns the same offer code only, which is one quality level                                                 |
| `images[]`                                           | 3.3 gallery (product + label close-up)               | Only one `image` today                                                                                                 |
| `printers[]` — `{ id, name, brand }`                 | 3.3 compatibility list, `isAccessoryOrSparePartFor`  | See 1.3 — today derived from `categories` and unreliable for brand                                                     |
| `rating` — `{ value, count }` and `reviews[]`        | 3.3, stage 4                                         | Moderated, real ones only                                                                                              |
| `questions[]` — `{ question, answer }`               | 3.3 questions and answers                            |                                                                                                                        |
| `updated_at`                                         | Stage 13 `dateModified`, sitemap `lastmod`           | Only on real content changes, not on a price change of one ban                                                         |

### 1.3 `Categorie` (`category`, `category/{id}`)

| Problem, measured on 2026-09-28                                                          | What is needed                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 11,994 categories return `url: ""`                                                   | A slug per category. The storefront mints `name-id` URLs meanwhile                                                                                                                  |
| 9,030 categories (75%) name a parent that is not in the response — 17 parent ids missing | Either publish the intermediate nodes, or add `brand` to every `prn` and `family` node. Without it a printer's brand cannot be resolved, so "Lexmark CX510de" is shown as "CX510de" |
| Only `brand`, `family` and `prn` nodes exist                                             | The ≈15 main product categories (toner cartridges, ink cartridges, drums…) — plan 3.1. `product.categories` already references them (id 10), but `category/10` answers `not_found`  |
| `deep=1` times out above ~1,000 children (>25 s)                                         | Brand pages need either a fast `deep` or a precomputed product list per brand                                                                                                       |
| No description on `prn` nodes                                                            | The printer description and image (Icecat, already in HUB at `/admin/oferta/prn-categories`)                                                                                        |
| No editorial layer                                                                       | Short sentence, guide, questions, glossary per main category — plan 3.1                                                                                                             |

### 1.4 `live`

Enough for anonymous prices. After login it needs the customer's context — see 4.2.

---

## 2. Catalogue routes that do not exist — priority B

| Proposed route                                              | Returns                                                                                                                                                                       | Plan                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /hub-api/v1/search?q=&page=&per_page=`                 | Grouped results: products, printers, families. Matches SKU, OEM code, name, printer model. Normalised (spaces, dashes, case, diacritics). In the shape Typesense would return | Stage 8                                                                                     |
| `GET /hub-api/v1/search/suggest?q=`                         | The same, short, for suggestions while typing                                                                                                                                 | Stage 8                                                                                     |
| `POST /hub-api/v1/search/codes`                             | Several codes at once → a match per code, with a confidence                                                                                                                   | Stage 8 "Am găsit 6 coduri"                                                                 |
| `GET /hub-api/v1/products?page=&per_page=&updated_since=`   | Every published product: `sku`, `url`, `updated_at`                                                                                                                           | Sitemap. Products are reachable only through a category today, so they cannot be enumerated |
| `GET /hub-api/v1/collections/featured`                      | Products featured manually, by position                                                                                                                                       | 3.1 "Alegerea noastră"                                                                      |
| `GET /hub-api/v1/collections/bestsellers?category=&brand=`  | Nightly, 90 days, in stock only                                                                                                                                               | 3.1, stage 4                                                                                |
| `GET /hub-api/v1/collections/equipment`                     | Featured printers, at most 8                                                                                                                                                  | 3.1                                                                                         |
| `GET /hub-api/v1/brands`                                    | Printer brands with logo, one sentence, and whether they hold products                                                                                                        | 3.1, stage 4                                                                                |
| `GET /hub-api/v1/brands/{id}/models`                        | The models of one brand, for the finder's second dropdown                                                                                                                     | Stage 4. The finder reads the provisional API today                                         |
| `GET /hub-api/v1/content/pages` and `/content/pages/{slug}` | Static pages: warranty, delivery, returns, terms, privacy, cookies, ANPC                                                                                                      | Stage 11. The footer links to four of these and they do not exist                           |
| `GET /hub-api/v1/content/guides`                            | Guides and articles                                                                                                                                                           | Stage 4                                                                                     |
| `GET /hub-api/v1/pickup-points?courier=&county=`            | FAN lockers, Cargus Ship & Go                                                                                                                                                 | Stages 1 and 11                                                                             |
| `GET /hub-api/v1/settings`                                  | Free-shipping threshold, immediate-delivery fee, points percentage, business hours                                                                                            | Stages 5, 6, 7. Hard-coded copy in the storefront drifts from HUB                           |

**The exact-code lookup works today** without any of these: `product/{sku}` resolves a code
the customer types. That is what `/cauta` uses. It finds a product by its own code only —
an OEM code such as `CF283A`, a printer model or a name find nothing until `search` exists.

### 2.1 What HUB must call — the revalidation webhook

The plan's central rule is that HUB asks the storefront to rebuild a page when a price
changes. The storefront side exists:

```
POST {STOREFRONT_URL}/api/revalidate
x-revalidate-secret: <REVALIDATE_SECRET>
content-type: application/json

{ "hub": { "products": ["CN-PGI29C", "REP-LMS312"], "categories": [25968], "all": false } }
```

- `products` — SKUs, exactly as HUB stores them.
- `categories` — category ids whose listing changed.
- `all: true` — everything from HUB. For a bulk import, not for one price.

HUB already pushes price changes to PrestaShop (`pret_schimbat_at`); this is one more
destination. Until HUB calls it, catalogue text is up to a few hours old. Prices and stock on
the product page are not affected — they are read fresh on every request.

---

## 3. Order routes — priority C

The contract reserves the `order` scope and the `conflict` / `unprocessable` error codes,
but has no order route. `POST /api/prestashop/order` is not a substitute: it requires a
`prestashop_order_id`, trusts the prices in the payload, and authenticates with a shop
secret that opens every shop.

Today an order is an email to the shop (Resend). It is placed only if that email was sent.

| Proposed route                                              | Purpose                                                                                                             | Plan         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| `POST /hub-api/v1/cart` · `GET/PUT /hub-api/v1/cart/{code}` | Cart saved in HUB, anonymous too, with a short code (`#A7K2`)                                                       | Stage 5      |
| `POST /hub-api/v1/cart/{code}/save`                         | "Salvează coșul": email + consent                                                                                   | Stages 5, 12 |
| `POST /hub-api/v1/cart/{code}/quote`                        | Delivery groups, the three options for "on order" products, shipping **per order**, allowed payment methods, points | Stage 5      |
| `POST /hub-api/v1/order`                                    | Places the order. HUB recomputes every price. Needs an idempotency key. May create two linked orders                | Stage 5      |
| `GET /hub-api/v1/order/{id}`                                | Status, AWB, invoice, tracking link                                                                                 | Stages 5, 6  |
| `POST /hub-api/v1/order/{id}/payment-link`                  | Netopia link for card payment                                                                                       | Stage 5      |
| `POST /hub-api/v1/anaf/check`                               | CIF → name, registered office, trade register number, active or not                                                 | Stages 1, 5  |

---

## 4. Customer routes — priority C

All of stage 1 is HUB work (`hub_customer_*`). Nothing in the storefront starts before it.

### 4.1 Account

| Proposed route                                                                     | Plan         |
| ---------------------------------------------------------------------------------- | ------------ |
| `POST /hub-api/v1/account/register` (PF or PJ)                                     | Stage 1      |
| `POST /hub-api/v1/account/login` · `logout` · `GET /account/session`               | Stage 1      |
| `POST /hub-api/v1/account/password/forgot` · `reset`                               | Stage 1      |
| `GET/PUT /hub-api/v1/account/profile` (with consents, WhatsApp opt-in)             | Stage 1      |
| `GET/POST/PUT/DELETE /hub-api/v1/account/companies`                                | Stage 1      |
| `GET/POST/PUT/DELETE /hub-api/v1/account/addresses` (with recipient, pickup point) | Stage 1      |
| `GET /hub-api/v1/account/orders` · `/invoices`                                     | Stage 6      |
| `GET /hub-api/v1/account/export` · `DELETE /hub-api/v1/account` (anonymisation)    | Stages 6, 11 |

### 4.2 Prices after login

| Need                                                                                                       | Plan                                                     |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `live` and `product` accept a customer session and return `price.customer` beside the public `price.value` | Framework: "preț public 171 lei, **prețul tău 150 lei**" |

The public price stays in the HTML. The customer price must never enter a shared cache.

### 4.3 IT fleet, lists, points

| Proposed route                                                                   | Plan        |
| -------------------------------------------------------------------------------- | ----------- |
| `GET/POST/PUT/DELETE /hub-api/v1/account/fleet/locations` and `/fleet/equipment` | Stage 6     |
| `GET /hub-api/v1/account/fleet/consumables`                                      | Stage 6     |
| `GET/POST/PUT/DELETE /hub-api/v1/account/lists` · `POST /lists/{id}/import`      | Stages 6, 8 |
| `GET /hub-api/v1/account/points` (movements, not a balance)                      | Stage 6     |
| `GET/PUT /hub-api/v1/account/notifications`                                      | Stage 7     |

### 4.4 Negotiation (PJ)

| Proposed route                                                                                     | Plan    |
| -------------------------------------------------------------------------------------------------- | ------- |
| `GET/POST /hub-api/v1/account/negotiations` · `POST /{id}/submit` · `/{id}/accept` · `/{id}/renew` | Stage 9 |

### 4.5 Returns — the one that needs no account

| Proposed route                                                                  | Plan                       |
| ------------------------------------------------------------------------------- | -------------------------- |
| `POST /hub-api/v1/returns/lookup` — order number + email → the order's products | Stage 10. No login, by law |
| `POST /hub-api/v1/returns` — type, state, products, description, pages printed  | Stage 10                   |
| `POST /hub-api/v1/returns/{id}/photos`                                          | Stage 10                   |
| `POST /hub-api/v1/contact`                                                      | Stage 11, the contact form |
| `POST /hub-api/v1/consent` — cookie choice, time, policy version                | Stage 11                   |

---

## 5. Faults in the contract as it stands

Not missing features — things that will hurt when the routes above are added.

| Fault                                                                                                  | Where                     | Risk                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /documents/pdf?id=` has no authentication and no token                                            | Contract, `Public`        | Invoices are readable by counting upwards. Must be fixed **before** the storefront links to an invoice                                               |
| Integration routes answer HTTP 200 on errors                                                           | Contract, tag description | The new order routes must use real status codes, as `hub-api/v1` does                                                                                |
| `X-Api-Secret` is not tied to `shop_code`                                                              | Contract, `SecretMagazin` | One shop's secret opens every shop                                                                                                                   |
| `stock.state` documents `sfurnizor`; the live feed was not observed sending it                         | `Stoc`                    | The storefront accepts it. Confirm it is in use                                                                                                      |
| Money is a JSON number in major units (`171`, `171.5`)                                                 | `Pret`                    | Works, and the storefront converts at the boundary. Integer bani would remove the rounding question                                                  |
| `features` carries internal entries: `Feed: skroutz.ro`, `Feed: cel.ro`, `Feed: ads`, `Cover grup: Nu` | `product/{id}`, live      | Which marketplaces a product is exported to is published to every visitor. The storefront hides these two names; HUB should not send them            |
| The contract says "documentation, not the source of truth"                                             | File header               | Field names changed from Romanian to English on 2026-09-13 within hours. The storefront accepts both spellings, but only for fields it already knows |

---

## 6. Suggested order for HUB

1. **Section 1.1** — six fields on `ProdusScurt`. One day of work, completes the collection page.
2. **Section 2.1** — call the revalidation webhook on a price or content change.
3. **Section 1.3** — brand on category nodes, and the main categories.
4. **`search`** — completes stage 8; the storefront's search box already exists.
5. **Section 1.2** — price tiers, 30-day lowest price, delivery estimate, recommended flag.
6. **Stage 1 in HUB**, then sections 3 and 4.
