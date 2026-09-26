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
- Catalog reads use `publicCommerceClient` and must never send a session: those responses
  land in a cache shared by every visitor.
- `<Suspense>` fallbacks must reserve the exact height of the loaded content (CLS budget).
- Optimistic UI values are display-only; the server response is the only truth for anything charged.
- Middleware is for routing only, never authorisation.

## Use these skills

Invoke the matching skill before writing code in these areas — each one encodes decisions that are
not obvious from the surrounding code:

| Working on                                                    | Skill                  |
| ------------------------------------------------------------- | ---------------------- |
| API client, typed fetchers, Zod boundary, error normalisation | `/commerce-data-layer` |
| Add/update/remove cart lines, Server Actions, optimistic UI   | `/cart-mutations`      |
| Caching, revalidation, `<Suspense>` streaming, TTLs           | `/commerce-caching`    |
| Checkout steps, order creation, PSP redirect and return       | `/checkout-flow`       |
| Server/Client component split, `'use client'`, bundle budgets | `/rsc-boundaries`      |

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

## Deployment

GitHub Actions owns both correctness (`ci.yml`) and delivery (`deploy.yml`). Delivery builds the
`Dockerfile`, pushes an image tagged with the git SHA to GHCR, and runs `deploy/deploy.sh` over
SSH on the Hetzner host, which health-checks the new container and rolls back automatically.

`deploy.yml` is a separate workflow rather than a job in `ci.yml`, and triggers on
`workflow_run` after CI succeeds. `ci.yml` sets `cancel-in-progress: true`, which would cancel
a deploy mid-flight — possibly after the image was pushed and before the health check.

The build runs on a GitHub runner, which is only possible because the commerce API is
public HTTPS: `next build` prerenders the `use cache` catalog scopes and performs real catalog
requests. **If the API ever moves behind a private network, this breaks** and the build must
move to a runner that can reach it. Check that first when a deploy fails at the build step.

The image pull on the host is authenticated with the run's own `GITHUB_TOKEN`, so no
long-lived registry credential is stored on the server.

Required Actions configuration (names must match):

| Kind     | Name                                                                 |
| -------- | -------------------------------------------------------------------- |
| Variable | `STOREFRONT_URL`, `HUB_API_URL`                                      |
| Secret   | `COMMERCE_API_URL`, `REVALIDATE_SECRET`                              |
| Secret   | `HUB_API_KEY`, `HUB_API_SECRET`                                      |
| Secret   | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` |

`STOREFRONT_URL` is a **variable, not a secret** — it is a public URL, and making it a secret
only means Actions redacts it from logs where you need to read it.

`Jenkinsfile` is superseded and kept for reference only. Do not run both: two pipelines
deploying the same host will fight over the container and the env file.

- `output: 'standalone'` in `next.config.ts` exists for the runtime image stage. Do not remove it.
- **A production image must be built where the commerce API is reachable**, because `use cache`
  scopes are prerendered. `--build-arg BUILD_SCRIPT=build:ci` builds against the mock instead,
  which bakes fixture products into the static shell — those images are tagged `-mockapi`
  and must never be deployed to customers.
- The container binds to `127.0.0.1` only. A TLS-terminating reverse proxy on the host is
  mandatory: the session cookie is `Secure`, so the app is broken over plain HTTP.
- Runtime config lives in `/opt/headless-ecomm-flow/app.env` (mode 600), written by the
  pipeline from Actions secrets and variables. Never bake it into the image.
- **`STOREFRONT_URL` must be in `app.env`.** Its absence used to be silent: the product page
  threw inside `generateMetadata`, Next swallowed it, and every PDP served 200 with no canonical
  URL and no Open Graph tags while `/sitemap.xml` returned an empty `<urlset>`. The smoke test
  still passed. `src/instrumentation.ts` now refuses to start without it, which makes every route
  return 500 so the health check fails and `deploy.sh` rolls back.
- `robots.txt` and `sitemap.xml` read `STOREFRONT_URL` at **request** time, deliberately. As
  prerendered routes they captured the build-time value, and `build:ci` defaults it to
  `http://localhost:3000` — which shipped a sitemap claiming the shop lives on localhost.

## Observability

- `src/instrumentation.ts` registers OpenTelemetry, but **only** when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Unset means no exporter, not a broken one.
- `src/commerce/client.ts` injects W3C `traceparent` on every outbound call. Keep it: without
  a trace spanning the hop, a slow PDP cannot be attributed to rendering vs. the upstream API.
- `onRequestError` in `src/instrumentation.ts` logs an error digest, never a message.
- Field Core Web Vitals go from `src/components/web-vitals.tsx` to `POST /api/vitals`, which
  logs structured JSON. Replace the log with a real sink when one exists — the client need
  not change.
- `POST /api/vitals` is public and unauthenticated, so treat every field as hostile:
  - The body is read through a **streaming** byte cap (`readCappedBody`). Never switch it to
    `request.text()`: that buffers whatever the caller sends before any check can run, which
    makes the cap decorative. `Content-Length` is an early-rejection optimisation only — it
    can be absent or lie.
  - Every logged field is drawn from a fixed set of our own values. The client-supplied
    `path` is normalised to a **route template** (`/orders/[id]`, else `other`) rather than
    sanitised, so no caller text — query strings, control characters, forged newlines,
    credentials, order references — can reach a log line.

## Verification

Run before declaring work complete:

```bash
pnpm lint && pnpm codegen:check && pnpm typecheck && pnpm test && pnpm build:ci
```

Use `build:ci`, not `build`. `use cache` content is prerendered, so `next build` performs
real catalog requests. `build:ci` runs against `scripts/mock-api.mjs` because no backend
exists yet — delete both scripts and use plain `build` once the real API is reachable.

`pnpm typecheck` runs `next typegen` first on purpose: route types such as `LayoutProps`
are generated, so a bare `tsc --noEmit` fails on a clean checkout.

`pnpm codegen:check` regenerates `src/commerce/api.ts` from `openapi/commerce.yaml` and
fails on any diff. Never hand-edit that file; change the spec and regenerate.

Tests are Vitest against MSW handlers seeded from the spec (`src/mocks/handlers.ts`).
`server-only` and `next/headers` are aliased to stubs in `vitest.config.mts`, so the data
layer is testable as plain Node code.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
