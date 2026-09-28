# New reprint.ro storefront — Next.js + React

The complete specification, stage by stage. Every stage states **what is built in the frontend**,
**how it looks on the page** (every button, every row) and **what changes in HUB**.

Anything that is not listed under "Open questions" is already decided.

---

## Table of contents

1. [The framework](#the-framework)
2. [Stage 0 — Preparations](#stage-0--preparations)
3. [Stage 1 — Customers, accounts, companies](#stage-1--customers-accounts-companies)
4. [Stage 2 — The public API](#stage-2--the-public-shop-api)
5. [Stage 3 — The catalog](#stage-3--the-catalog)
6. [Stage 4 — The home page](#stage-4--the-home-page)
7. [Stage 5 — Cart and checkout](#stage-5--cart-and-checkout)
8. [Stage 6 — The customer account](#stage-6--the-customer-account)
9. [Stage 7 — Notifications](#stage-7--notifications-email-whatsapp-pwa)
10. [Stage 8 — Search](#stage-8--search)
11. [Stage 9 — Negotiation](#stage-9--price-negotiation-pj)
12. [Stage 10 — Returns and warranty](#stage-10--returns-withdrawal-warranty)
13. [Stage 11 — Content and legal](#stage-11--content-static-pages-legal)
14. [Stage 12 — Abandoned cart](#stage-12--abandoned-cart)
15. [Stage 13 — Measurement](#stage-13--measurement-and-campaigns)
16. [Stage 14 — Later](#stage-14--later)
17. [What is NOT done](#what-is-not-done)
18. [Open questions](#open-questions)

---

## The framework

**Technology:** Next.js with React, hosted on **Vercel**, on its own domain, side by side with
PrestaShop until the new shop proves itself.

**HUB stays the brain:** products, categories, prices, stocks, customers, orders, invoices. The
frontend displays them and sends orders back.

**Why not on Romarg:** the shared hosting does not run Node. The build happens at Vercel.

### The rule that dictates the architecture

**The price must be in the HTML delivered by the server**, never fetched from the browser after load:

1. Google Merchant Center compares the price in the feed with the one found on the page. An old
   price in the HTML, replaced through JavaScript, gets the product suspended.
2. Structured data is written at render time. If it says something different from the page, same result.

**The solution:** static pages, and when HUB changes a price it asks Vercel to rebuild that page.
HUB already knows when a price has changed (`pret_schimbat_at`) and it already has the mechanism for
pushing to PrestaShop — one more destination is added.

**The only exception:** the group price and the negotiated price are added **after login**, on top of
the public one. The public price stays in the HTML, for Google, and is shown struck through next to
the customer's price.

### Progressive loading

- **Loaded first**, in full: title, main image, price, cost per page, stock, button, the trust block.
- **As the user scrolls:** images, reviews, related products, long text.
- **Code splitting:** the cart, the filters and the gallery are not downloaded on the first page.
- **Grey skeletons**, not empty space that jumps when the content shows up.
- **Long text behind "Afișați mai mult"** (Show more) — two or three sentences visible, the rest on demand.
- **Exceptions that are never deferred:** the price, the structured data, the main image (Google
  measures it as page speed).

---

## Stage 0 — Preparations

**What you do:**
- a Vercel account, linked to GitHub;
- company accounts: Google Analytics, Tag Manager, Merchant Center, Meta Business;
- a WhatsApp Business Platform (API) account, with the company verified at Meta;
- the decisions from "Open questions".

**In HUB:** nothing.

---

## Stage 1 — Customers, accounts, companies

The foundation. Without it there is no cart, no order, no notifications, no IT fleet.

### The model

```
ACCOUNT (email + password) → Ion Popescu
   ├── PF profile       personal data
   ├── PJ profile       → COMPANY (CIF RO12345678) → group PJ2
   └── PJ profile       → COMPANY (CIF RO87654321) → group PJ0
```

**The account belongs to the person.** Companies are billing profiles, picked at checkout.

**The company is a separate entity, keyed on the CIF.** The commercial terms sit on it, so two
people from the same company automatically get the same group, **without their accounts being linked
to each other**: they do not see each other's orders, they do not share addresses, they do not share
the IT fleet.

### The groups

| Group | Who | Price | Negotiation | Payment term | 14-day withdrawal | Points |
|---|---|---|---|---|---|---|
| Guest | not logged in | public | no | no | yes (it is a PF) | no |
| PF | individual | public | no | no | **yes** | **yes** |
| PJ0 | company, at sign-up | public | **yes** | no | no | no |
| PJ1-PJ3 | company, by volume | grid per manufacturer | yes | yes | no | no |

- The group sits **on the company**, not on the account.
- Moving between PJ1-PJ3 is your decision. HUB proposes it from the volume of the last 12 months,
  **summed per CIF**.
- The group discount **does not stack** with a promotion: the lowest price wins.
- No calculation goes below the **price floor** set on the product.
- Discounts are **always calculated on the server**.
- The group also carries: payment term, free shipping threshold, credit limit.

### Sign-up — what is shown

**Step 1, two large cards side by side:**

```
┌─────────────────────────────┐  ┌─────────────────────────────┐
│  INDIVIDUAL (PF)            │  │  COMPANY (PJ)               │
│  • fast delivery            │  │  • invoice on the company   │
│  • 1:1 warranty             │  │  • price for your group     │
│  • 14-day no-reason return  │  │  • price negotiation        │
│  • loyalty points           │  │  • IT fleet per location    │
│  • order history            │  │  • payment by OP (from PJ1) │
│  • repurchase reminder      │  │  • several users            │
│                             │  │  ⚠ no 14-day withdrawal     │
│      [ Continuă ]           │  │      [ Continuă ]           │
└─────────────────────────────┘  └─────────────────────────────┘
```

Microcopy: „Continuă" (Continue).

The warning for companies is written right there, it is not discovered at the first return.

**Step 2, the form:**
- **PF:** last name, first name, email, phone, password.
- **PJ:** CIF (checked against ANAF, which fills in the name, the registered office and the trade
  register number by itself), then the person's name, email, phone, password.

**Under the phone field, always:**

> **Folosim WhatsApp** pentru informații despre comandă și pentru discuții cu tine. Scrie un număr
> care are WhatsApp — afli imediat când pleacă coletul și poți răspunde direct.
> ☑ Trimite-mi notificări pe WhatsApp *(pornită, se oprește dintr-un clic)*
>
> *(English: We use WhatsApp for order information and for talking with you. Give us a number that
> has WhatsApp — you find out the moment the parcel leaves and you can answer directly.
> ☑ Send me WhatsApp notifications (on by default, turned off with one click))*

**The PJ account is active immediately** if ANAF confirms the company is active.

### Verifying the contact details

- **Email:** format plus the existence of the domain (a mail server). A suggestion for the usual
  typos: „Ai scris `gmial.com`. Ai vrut `gmail.com`?" (You typed `gmial.com`. Did you mean
  `gmail.com`?) with a fix button.
- **On confirmation the email is shown large**, with an "edit" link next to it. It is not asked for twice.
- **Phone:** normalized, checked as a Romanian format (`07` + 8 digits).
- **No SMS.** The channels are email and WhatsApp.
- Emails bounced as undelivered are flagged in HUB.

### Addresses and the three roles

| Role | What it holds | Where it is used |
|---|---|---|
| **Who orders** | name, email, phone/WhatsApp | communication, notifications, conversations |
| **Who receives** | name, phone, address or pickup point | **AWB** |
| **Where the invoice goes** | one or more email addresses | invoice, declaration, advance invoice |

**Everything is inherited from the account**, and the checkboxes only open up what is different:
- at billing: ☐ **A different email address for the invoice** → the field appears;
- at delivery: ☐ **Someone else receives the parcel** → name and phone appear.

**They are kept on the address**, not on the order: the second time they come pre-filled. A **copy of
all of them** is written on the order anyway, even when inherited.

**Sending rules:**
- **the AWB takes the recipient's name and phone**, never those of the person who ordered;
- if the recipient has no phone, the order's phone is used;
- the confirmation, the payment and the shipping notice go to the person who ordered;
- the invoice goes to the billing email addresses, plus a copy to the person who ordered.

**A pickup point is not an address**, it is a point chosen from the courier's list (FAN locker,
Cargus Ship & Go): the identifier is saved, **a copy of its data** (name, address, opening hours) and
the courier. At order time it is re-checked — points do get closed.

### The customer page, in HUB

- details, **his companies with the group of each one**, addresses with their recipients, billing
  email addresses;
- orders, invoices, **the WhatsApp conversation**, IT fleet, points;
- **internal notes** — „preferă livrare dimineața" (prefers morning delivery), „cere mereu factură pe
  firmă" (always asks for an invoice on the company);
- **search by phone and by email** (that is how you look him up when he calls);
- when a phone number or an address is changed, a question:

> Ai schimbat telefonul. **Aplici și pe comenzile în lucru?**
> ☑ Comanda #1234 — neexpediată
> ☐ Comanda #1180 — expediată, AWB emis
>
> *(English: You changed the phone number. Apply it to the orders in progress as well?
> ☑ Order #1234 — not shipped · ☐ Order #1180 — shipped, AWB issued)*

**Shipped or invoiced orders are left untouched.** Every change goes into the history: who, when,
what was changed.

### Changes in HUB

| Table / work item | What it holds |
|---|---|
| `hub_customer_account` | email, password (hash), name, phone, consents |
| `hub_customer_company` | **unique CIF key**: name, registered office, ANAF state, group, payment term, credit limit, 12-month volume |
| `hub_customer_invoice` | the account's billing profile; for a PJ it points to the company; billing email address(es) |
| `hub_customer_delivery` | addresses **and pickup points**, each with its own recipient and phone |
| `hub_customer_session` | frontend authentication |
| Discount grids | manufacturer → percentage, per group |
| The customer page | see above |
| Propagating corrections | only on orders not yet shipped, with a checkbox |
| Backfill from the past | companies are created from the CIFs of the existing orders, with their volume |
| CIF normalization | `RO12345678`, `12345678`, with spaces → the same row |
| ANAF check | when the company is added and **on every order**; the answer is remembered for 24 hours |

⚠️ `hub_companies` holds **your own** legal entities. Customer companies live separately, under a
different name.

---

## Stage 2 — The public shop API

The catalog already exists: `hub-api/v1` (`ping`, `live`, `category`, `category/{id}`,
`product/{id}`), with a key and an HMAC signature, documented in `docs/openapi.yaml`, visible at
`/admin/settings/api-docs`.

**To be added:**

| Group | Routes |
|---|---|
| Collections | equipment, CRG family, brand; featured products; best sellers |
| Search | SKU, OEM code, name, printer model; suggestions; list of codes |
| Account | sign-up, login, password recovery, profiles, addresses, companies |
| Cart | server-side save (anonymous too, with a short code), group price after login |
| Order | placement, status, history, invoices |
| IT fleet | locations, equipment, the fleet's consumables |
| Lists | saved lists, import from a file |
| Negotiation | request, counter-offer, acceptance |
| Return | request, photo upload |
| Content | category texts, static pages, guides, questions |

**Rules:** the public routes never expose the purchase price, the supplier or the margin. The group
price and the negotiated price are computed on the server. The order is validated end to end in HUB —
the prices sent by the browser are never trusted.

---

## Stage 3 — The catalog

### 3.1 The main categories (≈15)

**Guidance pages**, not product lists. In order:

**1. Find by printer** — at the very top, before any card:
```
Ce imprimantă ai?   [ Marcă ▾ ]  [ Model ▾ ]   [ Caută ]
sau scrie codul de pe cartuș:  [____________]  🔍
```

Microcopy: „Ce imprimantă ai?" (What printer do you have?) · „Marcă" (Brand) · „Model" (Model) ·
„Caută" (Search) · „sau scrie codul de pe cartuș" (or type the code printed on the cartridge).

**2. Brand cards** — logo, one sentence, **three products from the brand** (the best sellers in that
category, with price), a „Vezi toate" (See all) button.

**3. Alegerea noastră** (Our pick) — products featured **manually**, by position.

**4. Best sellers** — **automatic**, 90 days, in-stock only, recomputed overnight.

**5. Featured equipment** — manual, at most 8, links to collections.

**6. Guidance** — a buying guide, an **Original / Premium / Economic** table, **how much a page
costs** (with real figures from the catalog), the 1:1 warranty.

**7. Frequently asked questions** and a **glossary** (toner, cartridge, drum, developer, yield,
coverage).

**Three levels of effort on the text:**
- **Full** (guide, table, cost per page, 8-10 questions, glossary): toner cartridge, ink cartridge.
- **Medium** (short guide, 5-6 questions): drum, fuser, waste container, chip, ribbon, print head,
  developer unit.
- **Short** (two sentences, 3 questions): refilling, components, labels.

**The three parent groups — Consumables (Consumabile), Refill materials (Materiale pentru
reîncărcare), Equipment maintenance (Mentenanță echipamente) — are NOT pages.** They are groups: they
order the products inside a collection and they show up as **labels in the menu, not as links**. The
URLs of theirs that are indexed today redirect to the child category.

### 3.2 The collections

Printers and CRG families **are filter values**, not categories. Only the main categories are mapped
to the Google taxonomy; the collections inherit it.

**Two kinds:**
- **equipment collection** — "what goes into my printer";
- **CRG family collection** — "what variants exist for TN328".

They link both ways: the group title inside the equipment collection leads to the family, and the
family has a "compatible equipment" section.

**The layout — a table, grouped:**

```
Consumabile pentru Konica Minolta bizhub C250i
[ Original ]  [ Premium ✓ ]  [ Economic ]        ← one control, switches all groups

━━ Premium toner cartridges Konica Minolta bizhub C250i ━━━━━━━━━━━━━━━━━━━━━━
 Color   │ Product                     │ Yield     │ Cost/pg  │ Price│ Stock│
 Black   │ Toner Premium TN328K Black   │ 28,000    │ 0.61 b   │ 171  │  ✓   │ [Adaugă]
         │ G&G · Recomandat REPrint                                alte 3 ▾
 Cyan    │ Toner Premium TN328C Cyan    │ 26,000    │ 0.65 b   │ 171  │  ✓   │ [Adaugă]
 Magenta │ …
 Yellow  │ …
 ───────────────────────────────────────────────────────────────────────────
 Set 4 culori TN328 — 640 lei instead of 684                        [Adaugă]

━━ Premium drum unit Konica Minolta bizhub C250i ━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━ Maintenance Konica Minolta bizhub C250i ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Microcopy: „Consumabile pentru …" (Consumables for …) · „Adaugă" (Add) · „Recomandat REPrint"
(REPrint Recommended) · „alte 3 ▾" (3 more) · „Set 4 culori TN328" (TN328 4-colour set).

**Layout rules:**
- **Order of the groups:** Consumables → Refill materials → Equipment maintenance.
- Inside a group, a **fixed order by `tip_produs`** (toner, ink, drum, developer, waste container),
  written in the configuration, **not alphabetical**.
- Inside a type, **the colours in a fixed order**: black, cyan, magenta, yellow. Bundles last.
- **Empty groups disappear** — no titles without content.
- **The quality selector applies to consumables only** (powders and parts have no quality levels).
- **„alte 3 ▾"** opens the rows underneath, slightly indented, each with its own brand, price and
  stock. Nothing moves, nobody leaves the page.
- **One version per URL:** the HTML ships with Premium; switching the level happens in the browser,
  with no new URL, otherwise you end up with three pages competing with each other.

**On a phone:** what stays is **the colour, the price, the button**; the yield and the cost per page
move to a second line, under the name. The first group open, the rest collapsed, with the count in
the title: „Reîncărcare (6)" (Refilling (6)).

**Under the table:** two sentences + „Afișați mai mult" (Show more) · the equipment description with
an image (Icecat) · replacement instructions · frequently asked questions for the collection · links
to neighbours (other models in the series, the CRG family) · `ItemList` + breadcrumbs.

**Filters:** colour, capacity, availability, brand. **Sorting:** price, **cost per page**, newest.

**The breadcrumbs are generated from data** — category, OEM brand, CRG family — with no hand-written
categories. A quality level becomes a page only if it has enough products; below the threshold it is
missing from the path.

**Indexable:** equipment, CRG family, brand + product type.
**Filters only, not indexed:** colour, capacity, price, availability.

### 3.3 The product page

**The upper part:**

```
Breadcrumbs: Cartușe toner › Konica Minolta › TN328 › TN328K Premium

[image]     Toner Premium (28.000 pagini) pentru Konica Minolta bizhub C250i (TN328K)
            Code: TN328K-HQ · OEM: TN328K · Brand: HQ Premium
            ⭐ Recomandat REPrint  →  (leads to the warranty page)

            171,00 lei        0,61 bani / page
            Cel mai mic preț din ultimele 30 de zile: 165,00 lei

            În stoc: 7 buc · Primești joi

            1 buc 171 lei · 2 buc 165 lei · 4+ buc 158 lei

            [ − 1 + ]   [ Adaugă în coș ]   [ Discută pe WhatsApp ]

            🛡 Garanție 1:1, schimb imediat până la 50% consum
            ↩ Retur 14 zile · 🚚 Transport gratuit peste 500 lei
```

Microcopy: „Cartușe toner" (Toner cartridges) · „Cel mai mic preț din ultimele 30 de zile" (Lowest
price in the last 30 days) · „În stoc: 7 buc" (In stock: 7 pcs) · „Primești joi" (You get it
Thursday) · „buc" (pcs) · „Adaugă în coș" (Add to cart) · „Discută pe WhatsApp" (Chat on WhatsApp) ·
„Garanție 1:1, schimb imediat până la 50% consum" (1:1 warranty, immediate replacement up to 50%
consumption) · „Retur 14 zile" (14-day return) · „Transport gratuit peste 500 lei" (Free shipping
over 500 lei).

**Cumpără inteligent** (Buy smart — shown when the product is part of a bundle):
> **Cumpără inteligent. Beneficiezi de o reducere de 44 lei.**
> Set 4 culori TN328 — 640 lei în loc de 684 · [Vezi pachetul]
>
> *(English: Buy smart. You get a 44 lei discount. TN328 4-colour set — 640 lei instead of 684 ·
> [See the bundle])*

**Stock in figures:** an exact number only for **own stock below 10** (`În stoc: 7 buc`), otherwise
`10+`. For supplier goods, **never a number** — „disponibil în 2-3 zile" (available in 2-3 days).

**The variants strip** — the other manufacturers, same quality, same **OEM code + colour**:

```
Aceeași calitate, alți producători:
[ HQ Premium 171 lei · în stoc · Recomandat ] [ Integral 189 lei · în stoc ]
[ CET 165 lei · în stoc ]  [ G&G 158 lei · fără stoc ]   ← dimmed, stays visible

Vezi și:  Original 409 lei  ·  Economic 132 lei
```

Microcopy: „Aceeași calitate, alți producători" (Same quality, other manufacturers) · „în stoc" (in
stock) · „fără stoc" (out of stock) · „Vezi și" (See also).

**Compatibility** — every row is a link to the printer's collection, and the text says what the
product is for that piece of equipment:
> Toner premium pentru **Konica Minolta bizhub C250i**
> Toner premium pentru **Konica Minolta bizhub C300i**
>
> *(English: Premium toner for Konica Minolta bizhub C250i / C300i)*

**Comparison table** Original / Premium / Economic: cost per page, yield, warranty, who it suits.
Plus the explicit comparison with the original.

**Questions and answers** (the layer for AI):
- Which printers is it compatible with?
- How many pages does it print and at what coverage?
- How much does one printed page cost with it?
- Does it have a chip? Does the printer firmware need updating?
- What is the difference from the original cartridge?
- What warranty does it have?
- How do I replace it?
- Is it new or refilled?

**Rules:** all the text in the HTML that is delivered · every answer stands on its own, with the
product name inside it · the question as a heading, the short answer right underneath · explicit
figures, not adjectives.

**Further down:** what else the equipment needs (only what is **common to all** the printers of that
product) · replacement instructions · technical data sheet · customer reviews and questions · the
other colours in the family · delivery and returns.

**The gallery:** the main image shows **exactly what the customer receives**. Two images are enough:
the product and a close-up of the label.

**The „Recomandat REPrint" badge** is rendered **on the page, over the image**, never baked into the
file — Google forbids promotional text on the feed image; a secondary image may carry it.
**Only one per group.** When the recommended one is out of stock, the next one with stock takes its
place automatically.

**On products with a seal**, written **before the purchase**:
> Produs cu sigiliu de siguranță. La retur, sigiliul trebuie să fie intact.
>
> *(English: Product with a security seal. On a return, the seal must be intact.)*

**The WhatsApp button**, next to „Adaugă în coș", **only once per page**, with a pre-filled message:
> „Bună! Am o întrebare despre **CN-PGI29C** — Cartuș cerneală Canon PGI-29C"
>
> *(English: Hi! I have a question about CN-PGI29C — Canon PGI-29C ink cartridge)*

**The price for a logged-in customer:** under the public one — „preț public 171 lei, **prețul tău 150
lei**" (public price 171 lei, your price 150 lei).

### Changes in HUB (stage 3)

| Work item | Details |
|---|---|
| Reviews | rating, title, text, name, date, **moderation state**, "verified purchase" |
| Product questions | question, answer, published; filled in manually at the start; **only on the products that sell** |
| Quantity tiers | a global rule + a per-product exception; the feed ships the price for one piece |
| "Recommended" flag | one per group (OEM code + colour + quality) |
| "Featured" position | a numeric column on the product (`0` = does not show) and on the printer node |
| Best sellers | nightly computation, 90 days, in-stock only, in its own table |
| Editorial layer per category | short sentence, guide, questions, glossary (on top of `descriere`, which exists) |
| Price history | kept for at least 30 days (Omnibus) — **to be taken out of the automatic cleanup** |
| "Has a seal" flag | on the product |
| Printer descriptions | **already done** — `/admin/oferta/prn-categories`, Icecat source, manually editable |

---

## Stage 4 — The home page

**At the top, a single thing:**

```
        Ce imprimantă ai?
   [ Marcă ▾ ]  [ Model ▾ ]  [ Caută consumabile ]
   sau scrie codul de pe cartuș / SKU:  [__________] 🔍

   🛡 Garanție 1:1   ↩ Retur 14 zile   🚚 Transport gratuit peste 500 lei   ☎ Vorbești cu un om
```

Microcopy: „Ce imprimantă ai?" (What printer do you have?) · „Caută consumabile" (Search
consumables) · „sau scrie codul de pe cartuș / SKU" (or type the code on the cartridge / the SKU) ·
„Garanție 1:1" (1:1 warranty) · „Retur 14 zile" (14-day return) · „Transport gratuit peste 500 lei"
(Free shipping over 500 lei) · „Vorbești cu un om" (You talk to a human).

**No slider.** That is the image that decides the speed Google measures and nobody clicks it. A
promotion, if there is one, goes in as a thin text strip, above it.

**Then, in order:**
1. **The printer brands** — 8-10 logos, leading to the brand collections.
2. **„Cumpără din nou"** (Buy again) — only for a logged-in customer: what he bought last time, with a button.
3. **The three groups** with their categories, as those cards.
4. **HQ Premium** — the brand block: what it means, what warranty it carries, why you recommend it.
5. **Best sellers**, with the cost per page next to the price.
6. **„Cât te costă o pagină tipărită"** (How much a printed page costs you) — real figures, compared across the three quality levels.
7. **For companies** — account, contract price, invoice, IT fleet, delivery per location.
8. **Guides and articles** — three pieces.
9. **Reviews**, with the overall rating.
10. **Footer** — brands, the most searched printers, the cartridge families, legal.

**Prices are visible without an account.**

**Structured data:** `Organization`, `WebSite` with search.

---

## Stage 5 — Cart and checkout

**Checkout on a single page.** For a customer who has ordered before, a four-line summary,
pre-filled from the last order:

```
Comanzi ca:      Ion Popescu · ion@firma.ro · 0722…        [modifică]
Factura:         SC Alfa SRL · CIF RO12345678 · Str. X     [modifică]
Livrare:         Depozit Ilfov · primește Popescu Ion      [modifică]
Plata:           Card                                       [modifică]

                        [ Trimite comanda ]
```

Microcopy: „Comanzi ca" (You order as) · „Factura" (Invoice) · „Livrare" (Delivery) · „primește"
(received by) · „Plata" (Payment) · „modifică" (edit) · „Trimite comanda" (Place the order).

**Checked before it is displayed:** the address still exists (otherwise it silently falls back to the
default one), the pickup point is still valid, the payment method is still allowed for the current
group and the current cart (with a short explanation of the change).

**For a PF:** only billing and delivery, plus the „livrează la adresa de facturare" (deliver to the
billing address) checkbox.
**For a guest:** nothing pre-filled; **the email is the first field**.

### The delivery groups

**own stock + limited** (24h) · **supplier stock** (24-96h) · **on order** (7-30 days).

**For the first two, a single choice:**

```
○ Primești tot joi        Așteptăm toate produsele, un singur colet. Transport normal.
○ Primești tot mâine      Aducem peste noapte ce e la furnizor.        +10 lei
```

Microcopy: „Primești tot joi" (You get everything on Thursday) — „Așteptăm toate produsele, un
singur colet. Transport normal." (We wait for all the products, one single parcel. Normal shipping.)
· „Primești tot mâine" (You get everything tomorrow) — „Aducem peste noapte ce e la furnizor." (We
bring in overnight whatever is at the supplier.)

If he picks the second one, the "supplier stock" group **disappears** into the first one.

### When the cart also has "on order" products

Three options, with the consequences computed on the spot next to each one:

| The choice | Orders | Shipping | Payment |
|---|---|---|---|
| 1. Only what is in stock | one | on the remaining total | anything, cash on delivery included |
| **2. I wait for all the goods** *(default)* | one | **on the total** → 600 lei = free | **no cash on delivery**, payment in full |
| 3. Split in two | **two** | per order | cash on delivery allowed |

**Option 1** opens a confirmation dialog:
> **Elimin următoarele produse din coș?**
> · Toner Xerox 106R02773 × 2
> · Cilindru DR316 × 1
> [ Elimină ]  [ Salvează pentru mai târziu ]  [ Renunț ]
>
> *(English: Shall I remove the following products from the cart? · Toner Xerox 106R02773 × 2 ·
> Cilindru DR316 × 1 · [ Remove ] [ Save for later ] [ Cancel ])*

**Option 3** creates **two orders**, linked to each other in HUB. The "on order" order goes into
**waiting** until the advance payment.

**Shipping is computed per order**, not per cart. Every block shows its own subtotal and threshold:
> Livrarea 1 — 400 lei · **mai ai 100 lei până la transport gratuit**
>
> *(English: Delivery 1 — 400 lei · 100 lei to go until free shipping)*

Example: 300 in stock + 100 at the supplier + 200 on order → **two shipping charges**, even though
the cart is 600.

**A cart with nothing but "on order" products** shows no choice at all: one order, with an advance payment.

### The advance payment

An order that is entirely "on order" requires **at least 50%**, computed **on the order**. You issue
the advance invoice yourself, from a **new button on the order card, under the Oblio invoice button**,
with the proposed amount editable up to 100% (the customer may ask for the full invoice).

At delivery: **the advance is reversed by a credit note** and the whole amount is invoiced.
Procurement **is not blocked** — a note stays on the order.

⚠️ To be confirmed with the accountant: credit note + invoice for the full amount, or an invoice with
a line deducting the advance. The first one messes up the VAT when the advance and the delivery fall
in different months.

### Also shown in the cart

- **The cart's short code** (e.g. `#A7K2`), visible;
- **„Salvează coșul"** (Save my cart) with an email field + a consent checkbox;
- **[ Discută pe WhatsApp ]** (Chat on WhatsApp), only once, with a pre-filled message carrying the cart code;
- **„vei primi X puncte"** (you will get X points) — PF only;
- for companies, **the group price** next to the public one.

### Changes in HUB (stage 5)

- a cart saved on the server, with a **short code**;
- the delivery groups and the shipping rules **per order**;
- the immediate-delivery fee (+10 lei), configurable;
- the link between the two orders born from the same cart;
- **advance invoice**: its own type on `hub_invoices`, the link with the credit note and with the
  final invoice, so that it does not land in the reports as an ordinary sale;
- end-to-end validation of the order received from the frontend.

---

## Stage 6 — The customer account

**The menu:** Details · Companies · Addresses · **Orders** · Invoices · **Returns** · **IT fleet** ·
**My lists** · **Order from a list** · Points · Notifications · Privacy.

### The IT fleet

```
Parc IT
 ├── Depozit 1 (its own address)
 │     ├── Konica Minolta bizhub C250i · serial … · „contabilitate"
 │     └── HP LaserJet Pro M404dn
 └── Sediu central
       └── …
```

Microcopy: „Parc IT" (IT fleet) · „Depozit 1" (Warehouse 1) · „Sediu central" (Head office) ·
„contabilitate" (accounting — a free label given by the customer).

- the **„Adaugă în parcul IT"** (Add to my IT fleet) button on the printer page and on the product
  page, next to the list of compatible equipment;
- the equipment is linked to the printer node in HUB → its consumables are known automatically;
- **serial number and inventory tag: optional**, plus a free-form note („de la fereastră" — the one
  by the window);
- the location has **its own address**, so delivery goes straight there;
- **„Consumabilele parcului meu"** (My fleet's consumables) — one page with everything that goes into
  all the printers, ready to order, with ordering per location;
- history and **cost per piece of equipment, per year**;
- **the fleet belongs to the person who added it**, not to the company.

### Saved lists

- **named, for companies** („Depozit 1 — de comandat" / Warehouse 1 — to order), one simple list for individuals;
- "add everything to the cart";
- notifications per list: **the price dropped** (with a chosen threshold), **back in stock**, **went
  into a promotion**, **end of life** (with **the replacement** from the OEM/CRG nomenclature);
- the notification checkbox is **on when the list is saved**, turned off with one click;
- the anonymous list (from the browser) **moves into the account** on login.

### Loyalty points (PF only)

- shown **in the cart** („vei primi X puncte" / you will get X points);
- after delivery they go **pending**, and become valid **after 14 days** (the withdrawal window);
- **valid for 6 months**;
- the percentage is set in HUB; they are granted **on the amount paid, shipping excluded**;
- **at most 20%** of an order can be covered with points;
- **they are taken back on a return** (the balance can go negative);
- they are kept as **movements**, not as a balance — otherwise you have nothing to show when someone
  disputes it.

### Privacy, inside the account

- **„Descarcă datele mele"** (Download my data) — everything we hold, in one file;
- **„Șterge contul"** (Delete my account) — with the explanation that **invoices are kept for 10
  years**, so deletion means anonymization.

### Changes in HUB (stage 6)

`hub_customer_*` for locations, equipment, lists, points (movements), return requests; the list
import tool; the screens inside the customer page.

---

## Stage 7 — Notifications (email, WhatsApp, PWA)

**Channels:** email and **WhatsApp**. No SMS.

**Triggers:** price drop (with the customer's threshold) · back in stock · entering a promotion ·
**end of life, with the replacement** · the repurchase moment coming up (from the yield and the date
of the last order).

**Sources:** the IT fleet and the saved lists.

**Rules:** at most **one email a day**, batched · consent for notifications is asked **after the
first save**, not when landing on the site · one-click unsubscribe.

### PWA

An installable app, no native apps.
⚠️ **On iPhone notifications only work if the site is added to the home screen** — an explicit
"install" step is needed, otherwise half the customers get nothing.
Bonus: **reading the code off the box with the camera**.

### WhatsApp

**The conversation hangs off the phone number, not off the order:**

```
CONTACT (phone)
   ├── conversation (all the messages)
   ├── linked to an account — if one exists
   └── linked to orders — zero, one or several
```

Whoever writes without having ordered gets a contact and a conversation; when he orders, it links
itself. From the conversation of someone who has not bought yet you can build an **offer** directly.

- the automated messages are **approved templates**; order information is the cheap category,
  promotion is a different one and needs separate consent → **we do not send promotions on
  WhatsApp**;
- **the 24-hour window**: if the customer writes, you answer freely; otherwise templates only. **The
  window's clock must be visible in the inbox**, otherwise you answer and the message does not go out;
- **number verification happens by itself**: if the message does not arrive, HUB flags the account
  („numărul nu are WhatsApp" / the number has no WhatsApp) and falls back to email, without trying a
  second time;
- **the „Discută pe WhatsApp" button** (Chat on WhatsApp) — on the product page (next to „Adaugă în
  coș") and in the cart, **only once in each**. The customer starts it, so the window opens without
  marketing consent and without the cost of a template;
- **outside business hours**, an automatic reply: „am primit mesajul, revenim mâine de la 9" (we got
  your message, we will get back to you tomorrow from 9);
- conversations coming from the cart are **marked differently** — those are people with goods in the cart.

⚠️ **The migration:** one number cannot be on the app and on the API at the same time, and the
history does not move. We build the inbox in HUB first, test it on a new number, then move the
well-known number, with one announced day of interruption.

### The emails

A **single shared template** — header with the logo, a title, a **big button**, a product table, a
footer with the company details. Written on tables with inline styles, so it looks the same in
Outlook and on a phone.

| Email | The button |
|---|---|
| Order confirmation | See the order |
| Payment link | Pay now |
| Payment confirmed | See the invoice |
| Shipped | Track the parcel |
| Delivered | Leave a review |
| Invoice (+ **declaration of conformity**) | Download the invoice |
| Welcome / password reset | Go to my account |
| Price dropped / back in stock / time to reorder | See the product |
| Abandoned cart (1h, 24h, 72h) | Resume the order |

### Changes in HUB (stage 7)

WhatsApp contacts, conversations and messages · **the message inbox with the 24-hour clock**, with
the contact's order list next to it · notification subscriptions and a **sending queue** · the shared
email template · hooking up the price trigger (it already exists).

---

## Stage 8 — Search

**It understands four ways of searching:** the code on the cartridge (`CF283A`, `006R04404`), the
printer model (`M127fn`), the name („toner negru brother" / brother black toner), your own code
(`REP-LMS312`).

**Normalization:** spaces and dashes are stripped (`cf 283 a` → `CF283A`), case-insensitive, without
diacritics.

**Grouped suggestions**, while he types:

```
PRODUCTS
  ├ Toner HQ Premium CF283A       69,00 lei   în stoc
  └ Toner compatibil CF283A       48,00 lei   în stoc
PRINTERS
  └ HP LaserJet Pro MFP M127fn    → 6 consumables
FAMILIES
  └ HP 83A / 83X
```

Microcopy: „în stoc" (in stock).

**Order of the results:** exact code → printer model → name. **Products in stock move up.**

**Equivalences** to be maintained: toner/cartridge/ink · printer/multifunction · negru/black/BK ·
KM/Konica Minolta · HP/Hewlett Packard.

**The results page:** the same grouped tables as in the collections, the same filters, plus **„ai
vrut să spui…"** (did you mean…).

**No results:** search by printer, **the WhatsApp button** („nu găsești? scrie-ne" / can't find it?
write to us), nearby categories, and if he searched an OEM code you do not carry — **the equivalents
from the nomenclature**.

**All searches are saved**, especially the ones with no results. That is the to-do list for
procurement and for the nomenclature.

### Nudging towards an account

| Signal | What happens |
|---|---|
| 5-6 searches | a banner at the top of the results: „Cauți mai multe produse? **Încarcă lista o dată**" (Looking for several products? Upload the list in one go) |
| 10-12 searches | a screen: **„Timpul tău e important pentru noi"** (Your time matters to us), a big account button, and underneath it, small, **„continuă căutarea"** (keep searching) |
| more than 30 in a few minutes | rate limiting per IP (bots) |
| he pastes several codes in the box | „**Am găsit 6 coduri.** Le caut pe toate odată?" (I found 6 codes. Shall I search all of them at once?) |
| a cart with more than 10 lines | „salvează lista" (save the list) |

The banner appears once per visit and can be dismissed.

### Order from a list (My account)

**A single tool**, for authenticated customers only. The plain search stays there for occasional lookups.

1. **Input:** pasted text · a file (Excel, CSV, PDF) · **a photo**.
2. **OCR inside the customer's browser** for photos and scanned PDFs — **no per-call cost**, and the
   image does not even leave his machine. Excel, CSV and text PDFs are read directly.
3. **Safe matching**, without AI: product code → OEM code → equivalences from the nomenclature →
   printer model. Because the codes are distinctive, a misread letter gets fixed at matching time.
4. **A verification screen:**

| What I read | What I found | Confidence | Quantity | |
|---|---|---|---|---|
| `CF283A x5` | Toner HQ Premium CF283A · 69 lei | certain | 5 | ✓ |
| `toner konica c250 negru` | TN328K · 171 lei | **to be confirmed** | 1 | *pick another one* |
| `xerox 106R02773` | — not found | — | — | *ask for a quote* |

**Nothing uncertain goes into the cart by itself.** The rows that were not found come to you, as a request.

5. The list **is saved in the account** and becomes a named list.

**The same tool, inside HUB, for you:** a supplier's offer or a customer's request, put through the
same funnel. **The HUB one is built first**, tuned on real data, and only then handed to the customers.

⚠️ **Typesense** stays for later: it does not run on Romarg, and 17,400 products are few for MySQL.
The search response is built **in the shape Typesense would have**, so the source can be swapped
without touching the frontend.

**About SQL injection:** the danger comes from gluing the term into the query text, not from
searching in MySQL. With prepared statements the term never reaches the SQL. What to watch: the sort
column (a fixed list in the code), the pagination (integers, with a ceiling), the length of the term.

---

## Stage 9 — Price negotiation (PJ)

1. The **„Negociază preț"** (Negotiate the price) button on the product page, **on PJ accounts only**
   (from PJ0 up).
2. The customer types **the quantity and the price he wants** → it is added to a list. The list can be
   filled in over several days.
3. **„Trimite spre aprobare"** (Send for approval) → it shows up in HUB as an **offer** (the offers
   module already exists).
4. You answer **line by line**: accept, counter-offer, refuse.
5. The customer gets an **email and a notification**, and sees the new prices.
6. **„Acceptă"** (Accept) → everything goes into the cart with **locked quantities and prices**. He can
   walk away from **the whole offer**, not from a single line. Ordinary products can sit in the same
   cart, but the offer block stays visually separated.

**Rules:**
- **Valid for 24 hours.** On expiry: „a expirat" (it expired) + a **„cere din nou"** (ask again)
  button, which rebuilds the list with the same quantities, at today's prices.
- **No automatic approval.**
- **An offer does not reserve the goods** — written on the page: „prețuri garantate până la data X, în
  limita stocului" (prices guaranteed until date X, subject to stock).
- The starting price is **the customer's price** (after his group), not the public one.
- The negotiated price **beats** the group discount; they do not add up.
- The offer belongs to **the account**, with a "valid for the whole company" checkbox when you want it.

**In HUB:** on every line — **purchase price, margin, floor**, with a red flag below the floor · an
**"accept everything above X% margin"** button · **a list of pending negotiations, with the age of
each one** and a flag when one gets close to 24 hours.

---

## Stage 10 — Returns, withdrawal, warranty

**The „Retragere din contract" button** (Withdrawal from contract) — in the **footer on every page**,
in the account on every delivered order, and in the delivery email.

**In two clicks:** the button → the form (order + products) → confirmation.
**No account required** — the order is found by number and email. If you force him to create an
account, you have broken the very purpose of the law.

**For PF orders only.** Companies have no right of withdrawal; they see **„Retur / Garanție"**
(Return / Warranty).

**Three states, three paths:**

| The declared state | What it is | What happens |
|---|---|---|
| **New, sealed** | withdrawal | full refund; shipping is refunded **only when the whole order is returned** |
| **Unsealed, not tested** | withdrawal | accepted, with a check at receipt; an amount may be withheld |
| **Tested, faulty** | **warranty**, not withdrawal | inspection, then a 1:1 replacement or money back |

For consumables, "I put it in the printer" means **tested**, not unsealed — written in your own words
in the form.

- **Reduction in value: between 10% and 80%**, written in the terms, documented with photos.
- **Return shipping:** on a withdrawal the customer pays it, on a faulty product you pay it.
- For "tested, faulty": a description of the problem, **mandatory photos**, and **the number of pages
  printed** (for the 1:1 warranty, up to 50% consumption).
- The customer gets an **email confirmation immediately**, with the registration date — that is the
  proof he is inside the 14 days.

### Numbered seals

- **a flag on the product** in HUB — only on the expensive products, otherwise nobody records them
  any more;
- **the serial numbers are written in the order's product card (order_detail)**, on **a new line**,
  only for the products carrying the flag: `A10234, A10235, A10236`;
  - **separator: the comma**, spaces are ignored;
  - **a warning, not a block**, when the count does not match: „3 bucăți, 2 serii" (3 pieces, 2 serial numbers);
  - **the barcode scanner** types straight into the field (it behaves like a keyboard);
  - editable after shipping too, but **every change goes into the history**;
- **a mandatory photo of the seal** on a return, compared with the serial numbers that were shipped.
  If the number does not match, it is not your seal — proof that the product was tampered with and
  resealed;
- the condition written **on the product page, before the purchase**;
- **on a warranty replacement** the new seal is recorded.

⚠️ For individuals **withdrawal cannot be refused** over a broken seal — the legal exception is for
hygiene, not for consumables. **An amount is withheld**, with the evidence. For companies it can be
refused, because there the commercial terms are law between the parties.

### The declaration of conformity

**A PDF on every order**, attached to the email with the invoice. **Shared text** (you get it at
implementation time). It contains: the issuer, the products in the order, the standards, the warranty,
the date, the order number.

On orders with seals, **one extra card** with the products and **the serial numbers that were
shipped**, plus a sentence about what the seal means on a return.

### Changes in HUB (stage 10)

A single request, with a **type** (withdrawal / warranty / commercial return) and a **state**;
different paths; attached photos; resolution (refund, replacement, motivated rejection) wired further
to the credit note and to the return AWB (both already exist) · the serial-number line in the product
card · generating the declaration.

---

## Stage 11 — Content, static pages, legal

**The texts live in HUB**, editable from the admin — not in the project, so that they do not require a
deployment for every comma. The final page is still static HTML.

**Pages:** the 1:1 warranty (the target of all the badges) · delivery and returns · about us · for
companies · contact **with a form that lands in HUB** · **pickup points, with a map** (you have
thousands through FAN and Cargus and you say so nowhere) · reviews about the shop · frequently asked
questions · terms · privacy · cookies · ANPC and SOL · **accessibility statement**.

### Cookies

**We build the banner ourselves, in HUB** — the ready-made services (Cookiebot, CookieYes, OneTrust)
charge by **the number of scanned pages**, and you have more than 20,000; the free tiers cover 50-100.

- **four categories:** strictly necessary (always on), preferences, statistics, marketing;
- **nothing pre-ticked** apart from the strictly necessary ones;
- **"Reject all" just as visible** as "Accept all";
- **no script before consent** — not Google, not Meta, not statistics;
- **the proof of consent is kept**: what he chose, when, which version of the policy;
- **withdrawal** from a link in the footer; **renewal** every 6-12 months;
- **Consent Mode v2** wired to Google and Meta.

### GDPR

- **separate legal bases:** contract for the order and its information · **consent** for promotions,
  abandoned cart, price notifications · legitimate interest for fraud prevention;
- **"download my data"** and **"delete my account"** — deletion = **anonymization**, invoices are
  kept for 10 years;
- **written retention periods**: invoices 10 years, orders as long as the warranty plus the
  limitation period, conversations and technical logs — months, not years (the cleanup in HUB is the
  tool);
- **data processing agreements** accepted with Vercel, Meta, the couriers, the payment processor, the
  email service — usually **a checkbox inside each account**, not a negotiation;
- a register of processing activities and a procedure for incidents (72 hours).

### Accessibility

A European requirement since June 2025. **No** accessibility overlays glued on top of the site —
those do not deliver compliance. What is needed:

- **full keyboard navigation**, with no traps;
- **correct structure**: headings, buttons that really are buttons, forms with labels tied to fields;
- **alternative text** on images;
- **sufficient contrast**;
- **200% zoom** without the page falling apart;
- **errors said in words**, not just with a red border.

It is done **while the pages are being written**. Added afterwards, it is expensive.

---

## Stage 12 — Abandoned cart

**Collecting the email as a service, not as a demand.** In the cart:

> **Îți salvăm coșul** — îl regăsești de pe orice dispozitiv și te anunțăm dacă scade prețul la
> produsele din el.
> `email` [ Salvează coșul ]
> ☐ Vreau să primesc coșul salvat și oferte legate de el
>
> sau **[ Discută pe WhatsApp ]** — îți răspundem în câteva minute
>
> *(English: We save your cart — you find it again from any device and we tell you if the price drops
> on the products in it. `email` [ Save my cart ] ☐ I want to receive the saved cart and offers
> related to it · or [ Chat on WhatsApp ] — we answer in a few minutes)*

Plus **the email as the first field at checkout** — that catches the most.

**The consent checkbox is not pre-ticked**: an email with a promotion is commercial communication.

| When | What it contains | Discount |
|---|---|---|
| **1 hour** | „Coșul te așteaptă" (Your cart is waiting), with the products and the button | no |
| **24 hours** | the 1:1 warranty, the cost per page, the stock | no |
| **72 hours** | free shipping or a small discount, **with a deadline** | **once only** |

**The discount is not given in the first email** — customers learn to abandon on purpose.

**Rules:** the sequence stops the moment he places the order · one sequence per cart, not per product
added · the anonymous cart is attached to the account on login.

**The WhatsApp button in the cart** leads to a conversation where **you can place the order yourself**
(and send the payment link) or build **an offer**, for companies.

---

## Stage 13 — Measurement and campaigns

**At the end, once the site exists.** Put in early, they measure a page that changes daily.

| Tool | What for | Whose |
|---|---|---|
| Google Tag Manager | the box with all the tags | me |
| GA4 | behaviour, funnel | me |
| Google Ads | conversions, remarketing | your account |
| Merchant Center | feed from the web offer, daily | I build the feed |
| Meta Pixel + Conversions API | Facebook, Instagram | your account |
| Consent Mode v2 | ties the banner to all of them | me |

- **Events from the browser AND from the server:** the pixel loses 20-40% of the conversions. HUB
  sends the purchase event itself when the order is confirmed, with a **shared identifier**, so that
  it is not counted twice.
- **We report reality:** cancellations and returns are sent back to Google and Meta, so that the
  optimization runs on the money actually collected. Almost nobody does this.
- **One decision to write down:** the conversion value — with or without VAT, with or without shipping.

**Structured data:** `Product` + `Offer` · `AggregateRating`/`Review` (**real ones only**) ·
**`isAccessoryOrSparePartFor`** for every compatible printer · `gtin` from the EAN, `mpn` from the OEM
code · `ItemList` · `BreadcrumbList` · `FAQPage` · `Organization` · `WebSite` with search.
Plus Open Graph and Twitter Card on every page.

**Freshness:** `dateModified` **only on real changes**, `lastmod` in the sitemap from the same date. A
page that changes its price by one ban does not become "alive" — content that grows does that: new
reviews, new questions.

**The AI crawlers** (ChatGPT, Claude, Perplexity) — welcome, since we want our products in their answers.

---

## Stage 14 — Later

- **Equipment monitoring** (managed print services): an agent inside the customer's network, reading
  the **counters** and the levels over SNMP, prediction from the page counter (not from percentages,
  which lie), a notice 10 days ahead, automatic delivery **with limits** (a monthly ceiling, a fixed
  address, a stop button). A checkbox on the equipment: „doresc monitorizarea" (I want monitoring).
  Stage 1 stays the prediction from the yield and the last order, which asks nothing of the customer.
  ⚠️ Printers on USB are invisible; toner percentages are approximate.
- **Typesense**, if the lack of typo tolerance becomes a problem.
- **Points → gifts**, once the points have a history.
- **Named lists that start a negotiation** directly.
- **Seals with a printed serial** — already numbered, all that is left is recording them at shipping.
- **Own brand on the box** (private label at the supplier), if the volume justifies it. Until then: a
  label, a card in the box with the warranty and the review QR code, custom tape.

---

## What is NOT done

- **No copying texts from the competition.** A duplicate brings no rankings and it is protected.
- **No using prices sent by the browser.** They are recomputed in HUB.
- **No putting the badge into the image file** used in the feed.
- **No sending promotions on WhatsApp.**
- **No blocking the search** without a way out.
- **No deleting invoices** when an account is deleted.
- **No discount in the first abandoned-cart email.**
- **No showing stock numbers for supplier goods.**
- **No deferring the price** below the fold.

---

## Open questions

1. **The advance invoice** — a credit note + an invoice for the full amount, or an invoice with a line
   deducting the advance? *(accountant)*
2. **Withdrawal from contract** — does the obligation to have the button apply to goods as well, or
   only to financial services? *(lawyer)*
3. **Accessibility** — do you fall under the exception for small companies? *(lawyer)*
4. **The loyalty points percentage** and how much one point is worth in lei.
5. **Do we notify the recipient too** on WhatsApp when the parcel leaves? *(needs his consent)*
6. **The WhatsApp inbox in HUB** — from the start, or only automated sending in the first phase?
7. **The collections' URL** — under the category (`/cartuse/hp-laserjet-pro-m127fn/`) or at the root?
8. **Equipment vs CRG family** when a printer uses a single family — which one is the canonical page?
9. **The text of the declaration of conformity** — at implementation time.
10. **The Icecat licence** — which brands are free, what rights you have over the images.
11. **Our own GS1 prefix** — the codes we have now are sub-licensed; Google accepts them, Amazon and
    the marketplaces often do not.

---

## Work order

```
1. Customers, accounts, companies (HUB)   ← the foundation
2. Public shop API (HUB)
3. Frontend: skeleton + catalog
4. Cart, checkout, orders
5. The customer account (IT fleet, lists, returns)
6. Notifications (email, WhatsApp, PWA)
7. Negotiation
8. Content, static pages, legal             ← in parallel, does not block
9. Measurement and campaigns                ← at the end
```
