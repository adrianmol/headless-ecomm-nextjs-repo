---
name: commerce-data-layer
description: Rules for writing and modifying the commerce data layer in src/commerce — the typed OpenAPI client, session forwarding, selective Zod validation, money handling, and domain error normalisation. Use when adding or changing an API fetcher, a Zod schema at the API boundary, error mapping, or anything under src/commerce.
triggers:
  - user
  - model
---

# Commerce Data Layer

All backend access goes through `src/commerce`. Nothing else in the app calls the commerce API.

## Hard rules

1. `src/commerce/client.ts` starts with `import 'server-only'`. Every module that transitively imports
   it is server-only. Never import from `src/commerce` in a Client Component.
2. `src/components/**` must not import `src/commerce/**`. Components take plain props.
3. Never hand-edit generated types. Regenerate from the spec.
4. Never return raw API errors or raw Zod errors to the UI. Normalise first (see below).
5. Money is integer minor units + currency code. Never `number` for a price, never float arithmetic.

## Structure

```
src/commerce/
  client.ts              # createClient<paths>, server-only
  session.ts             # read cart/session cookie, forward to API
  errors.ts              # domain error union + normalisation
  <domain>/
    queries.ts           # read paths
    mutations.ts         # write paths (called from Server Actions only)
    schemas.ts           # Zod schemas for money/stock/order-state fields
```

## Adding a fetcher

```ts
// src/commerce/catalog/queries.ts
import "server-only";
import { client } from "../client";
import { normalizeError } from "../errors";
import { priceSchema } from "./schemas";

export async function getProduct(slug: string) {
  const { data, error } = await client.GET("/products/{slug}", {
    params: { path: { slug } },
  });
  if (error) throw normalizeError(error);
  return { ...data, price: priceSchema.parse(data.price) };
}
```

## Selective Zod validation

Generated OpenAPI types are a compile-time claim, not a runtime guarantee. Validate at runtime only
where being silently wrong is materially harmful — see ADR-0003.

**Validate:** money, totals, discounts, inventory/availability, order state, payment state, anything
feeding a pricing or eligibility decision.

**Do not validate:** titles, descriptions, marketing copy, image alt text, other cosmetic catalog
fields. Blanket validation costs real CPU on the hottest read paths and gets switched off under load,
which loses the protection where it mattered.

A validation failure is an infrastructure fault, not a user error: convert it to `Unavailable`, and log
with enough context to identify the endpoint and field.

## Domain errors

Normalise every failure into this union in `errors.ts`. UI switches on it exhaustively.

```ts
export type CommerceError =
  | { kind: "OutOfStock"; variantId: string; available: number }
  | { kind: "PriceChanged"; oldPrice: Money; newPrice: Money }
  | { kind: "CartExpired" }
  | { kind: "Unauthorized" }
  | { kind: "Unavailable"; retryable: boolean };
```

Map from the backend's structured error codes, never by string-matching a human-readable message. If
the backend does not yet expose a machine-readable code for a case you need, flag it as a contract gap
rather than pattern-matching prose.

`PriceChanged` requires a real UI flow — the customer sees and accepts the new price. Never silently
proceed with a changed price.

## Session forwarding

Read the session/cart cookie via `next/headers` and forward it on the outbound request. Never expose
the token to the client, never put it in a `NEXT_PUBLIC_` variable, never log it.

Cookies **cannot be set during Server Component render**. Any flow that needs to set a cookie must run
in a Server Action or Route Handler.

## Testing

Test fetchers against MSW handlers seeded from the OpenAPI spec, not hand-written JSON blobs — mocks
that drift from the spec give false confidence. Always cover: happy path, each domain error, and a
schema-violating response.
