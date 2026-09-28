# Storefront plan — where each stage stands

**Written 2026-09-28.** The specification is [nodejs-reprint.en.md](nodejs-reprint.en.md), the
owner's plan, saved here as downloaded. This file says what of it is built, what is not, and
why. What HUB has to add is listed separately in [hub-api-gaps.md](hub-api-gaps.md).

One rule decided everything below: **the storefront builds only what HUB can answer.** Where
the plan needs data the contract does not have, the feature is absent — not estimated, not
filled with placeholder text.

## Status by stage

| Stage | What it is                                 | Status                       | Blocked by                                             |
| ----- | ------------------------------------------ | ---------------------------- | ------------------------------------------------------ |
| 0     | Accounts at Vercel, Google, Meta, WhatsApp | Owner's work                 | —                                                      |
| 1     | Customers, accounts, companies             | Not started                  | HUB: all of it is `hub_customer_*`                     |
| 2     | The public shop API                        | 5 routes of ~60 exist        | HUB                                                    |
| 3.1   | Main category pages                        | Not started                  | HUB: main categories, editorial text, best sellers     |
| 3.2   | Collections                                | **Partly built**             | HUB: six fields on the product list form               |
| 3.3   | Product page                               | **Partly built**             | HUB: tiers, 30-day price, delivery day, badge, reviews |
| 4     | Home page                                  | **Partly built**             | HUB: brands with logos, best sellers, guides, reviews  |
| 5     | Cart and checkout                          | Session cart, order by email | HUB: cart, quote and order routes                      |
| 6     | Customer account                           | Not started                  | Stage 1                                                |
| 7     | Notifications                              | WhatsApp buttons only        | Stage 1, WhatsApp inbox in HUB                         |
| 8     | Search                                     | **Exact product code only**  | HUB: `search`                                          |
| 9     | Negotiation                                | Not started                  | Stage 1                                                |
| 10    | Returns                                    | Not started                  | HUB: returns routes; open question 2                   |
| 11    | Content and legal                          | Not started                  | HUB: content routes                                    |
| 12    | Abandoned cart                             | Not started                  | HUB: saved cart                                        |
| 13    | Measurement                                | Structured data only         | Comes last, by the plan's own order                    |
| 14    | Later                                      | —                            | —                                                      |

## What was built on 2026-09-28

### Product page — `/produse-hub/[slug]` (stage 3.3)

| From the plan                                                                    | Built     | Note                                                                                                  |
| -------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Breadcrumbs from data                                                            | Yes       | Type › brand › family › product. Type and brand are text, not links: HUB publishes no page for either |
| Code · OEM · brand line                                                          | Yes       |                                                                                                       |
| Price in the delivered HTML                                                      | Yes       | Read from HUB `live` on every request, not from the cached record                                     |
| Cost per page                                                                    | Yes       | Only when `capacity` is a page count. `36ml` and `70gr` give no figure                                |
| Quantity beside add-to-cart                                                      | Yes       |                                                                                                       |
| WhatsApp button, once, message pre-filled                                        | Yes       | Needs `WHATSAPP_NUMBER`; absent without it                                                            |
| Trust block                                                                      | Yes       | The plan's three lines, quoted                                                                        |
| Other manufacturers strip                                                        | Yes       | Live prices; out-of-stock ones stay visible                                                           |
| Compatibility, each row a link                                                   | Yes       | Brand shown only where HUB's tree reaches it — one printer in four                                    |
| `Product`, `Offer`, `BreadcrumbList`, `isAccessoryOrSparePartFor`, `gtin`, `mpn` | Yes       | Same figures as the page, by construction                                                             |
| Open Graph and Twitter Card                                                      | Yes       |                                                                                                       |
| Lowest price in 30 days                                                          | **No**    | Not in the contract                                                                                   |
| Quantity tiers                                                                   | **No**    | Not in the contract                                                                                   |
| Exact stock figure, delivery day                                                 | **No**    | `stock.quantity` is a threshold, not stock                                                            |
| "Recomandat REPrint" badge                                                       | **No**    | No flag                                                                                               |
| "Cumpără inteligent" bundle offer                                                | **No**    | A product does not say which bundles hold it                                                          |
| "Vezi și: Original · Economic"                                                   | **No**    | `related` is one quality level only                                                                   |
| Comparison table, questions, reviews                                             | **No**    | No data                                                                                               |
| Seal notice                                                                      | **No**    | No flag                                                                                               |
| Gallery                                                                          | One image | HUB sends one                                                                                         |

### Collection — `/categorii-hub/[slug]` (stage 3.2)

Built as a table per product type, in a fixed configured order, bundles last, empty groups
absent, first group open. The whole collection is loaded, not the first hundred.
`ItemList` and breadcrumbs included.

Missing, all for one reason — the list form of a product has no colour, yield, quality or
offer code: the colour and yield columns, cost per page, the colour order, the quality
selector, and "alte 3 ▾".

### Search — `/cauta` (stages 4 and 8)

Finds a product by its code, in any case, with or without the spaces a customer adds. Shows
it with the same consumable from other manufacturers. In the header on every page, and on
the home page. When nothing is found it says so, and offers the printer finder and WhatsApp.

It does **not** find an OEM code (`CF283A`), a printer model or a name. So the field is
labelled „cod produs", not the plan's „codul de pe cartuș": it names the search that works.

### Home page (stage 4)

The plan's trust strip replaces the design file's. `Organization` and `WebSite` structured
data added. Search by code added under the printer finder.

### Cart (stage 5)

WhatsApp button, once. The message lists the cart's contents, since a cart code needs a cart
saved in HUB.

### Revalidation webhook (the plan's central rule)

`POST /api/revalidate` now accepts HUB products and categories. The call HUB has to make is
written out in [hub-api-gaps.md §2.1](hub-api-gaps.md).

### Sitemap and robots

HUB collections that hold products are in the sitemap. `/cauta` is disallowed.

## Decisions that are the owner's

These were not decided here. Each changes what is built next.

1. **Hosting.** The plan says Vercel. This repository deploys a Docker image to Hetzner
   through GitHub Actions, with health check and rollback. Nothing was changed. Moving is a
   decision about who serves production, not a refactor.
2. **Two catalogues.** `/produse`, `/categorii` and `/compatibil` read the provisional API,
   which has no real backend. `/produse-hub`, `/categorii-hub` and `/modele` read HUB. The
   plan makes HUB the only source, so the first three go — but the home page's printer finder
   still reads brands and models from the provisional API, and the build and the test suite
   run against its mock. Removing them is its own piece of work, best done when HUB has
   `brands` and `brands/{id}/models`.
3. **Final URLs.** `/produse-hub/…` and `/categorii-hub/…` are working names. The plan's open
   questions 7 and 8 (collection URL, equipment against family) decide the real ones. Decide
   before the pages are indexed; after, every change is a redirect.
4. **Spelling.** The plan writes with diacritics („Adaugă în coș"). The existing pages do not
   („Adauga in cos"). New text follows the plan; existing text was left, because the test
   suite finds buttons by their text. One pass to convert all of it is small and separate.
5. **"Retragere din contract".** Not built: open question 2 is with the lawyer.
6. **Dead links in the footer.** Livrare, Termeni, Despre noi, Retur, Cash back and Promoții
   lead to pages that do not exist. They predate this work. The plan keeps that text in HUB
   (stage 11), so they wait for the content routes — or the links come out until then.
7. **Cookie banner.** Not built. Nothing on the site needs consent today: no analytics, no
   pixel, and the one cookie is the cart, which is strictly necessary. It is due with stage
   13, before the first script that does need it.

## What to watch

- **Every product page view is one request to HUB `live`.** The limit is 600 a minute per
  key. A crawler reading the catalogue quickly can reach it; the page then shows the cached
  price. If that happens in practice, ask HUB for a higher limit for this key before
  weakening the rule that the price is fresh.
- **The mock is not HUB.** The test suite runs against `scripts/mock-hub.mjs`. The pages were
  also read against the real catalogue on 2026-09-28: product `LCX310K-HQ`, printer
  `CX510de` (131 products), family `Canon PGI-29`, search hit and miss.

## Order of work from here

Follows the plan's own order, and what each step waits for.

1. HUB: the six list fields ([gaps §1.1](hub-api-gaps.md)) → the collection table is completed.
2. HUB: call the revalidation webhook.
3. HUB: `search` → `/cauta` is completed and relabelled.
4. HUB: main categories, brands, best sellers → stage 3.1 and the rest of the home page.
5. Owner: decisions 1–3 above.
6. HUB: stage 1, then cart and order routes → stages 5 and 6.
7. Stages 7, 9, 10, 11, 12, then 13 last.
