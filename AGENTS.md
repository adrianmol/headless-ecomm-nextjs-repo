# headless-ecomm-flow — Project Rules

Next.js App Router (RSC) storefront over a custom internal REST API. Next.js acts as a BFF: the
browser never talks to the commerce API directly. Full design in [docs/architecture.md](docs/architecture.md).

## Non-negotiable invariants

These cause security bugs or incorrect charges when violated, so they are always-on rather than
delegated to a skill:

- Money is **never** a `number`. Integer minor units + currency code; format only at the render edge.
- Never trust PSP return URL query parameters. Re-fetch order status from our backend.
- `src/commerce/**` is server-only. Never import it from a Client Component.
- `src/components/**` must not import `src/commerce/**`. Components receive plain props.
- Never cache cart, session, or order data.
- Optimistic UI values are display-only; the server response is the only truth for anything charged.
- Middleware is for routing only, never authorisation.

## Use these skills

Invoke the matching skill before writing code in these areas — each one encodes decisions that are
not obvious from the surrounding code:

| Working on | Skill |
| --- | --- |
| API client, typed fetchers, Zod boundary, error normalisation | `/commerce-data-layer` |
| Add/update/remove cart lines, Server Actions, optimistic UI | `/cart-mutations` |
| Caching, revalidation, `<Suspense>` streaming, TTLs | `/commerce-caching` |
| Checkout steps, order creation, PSP redirect and return | `/checkout-flow` |
| Server/Client component split, `'use client'`, bundle budgets | `/rsc-boundaries` |

Available review subagents: `commerce-reviewer` (architecture-invariant review),
`api-contract-auditor` (OpenAPI spec gaps), `perf-budget-auditor` (bundle and Core Web Vitals).

## Conventions

- Next.js `16.3.4` (August 2026 critical security release; do not downgrade).
- pnpm, pinned to `10.34.5` via `packageManager`. Do **not** bump to pnpm 11 — it
  requires Node `>=22.13` and will not run on the current local Node.
- Generated API types are committed. Regenerate via the codegen script; never hand-edit.
- Tailwind v4 + shadcn/ui on the **Radix** base (`components.json` style `radix-nova`).
  Add primitives with `pnpm dlx shadcn@latest add <name>`, never by hand.

## Toolchain notes

- **Local Node is 20.20.2, which is EOL (2026-04-30) and receives no security patches.**
  Next 16 still supports it (`>=20.9.0`), so this is not blocking, but upgrade to Node 22
  or 24 before production. CI already runs Node 22; see `.nvmrc`.
- Homebrew's `node@20` is keg-only, so `node` is absent from non-interactive shells.
  Prefix `PATH` with `/opt/homebrew/opt/node@20/bin` when scripting.

## Verification

Run before declaring work complete:

```bash
pnpm lint && pnpm typecheck && pnpm build
```

`pnpm typecheck` runs `next typegen` first on purpose: route types such as `LayoutProps`
are generated, so a bare `tsc --noEmit` fails on a clean checkout.

There is no test runner yet — add one in Phase 1 and update this command.
