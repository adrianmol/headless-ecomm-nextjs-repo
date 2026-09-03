# Production image for the storefront.
#
# Node 22, not the local Node 20: 20 reached end of life on 2026-04-30 and gets
# no security patches. CI already runs 22 (.nvmrc), and a container is the one
# place we are free of the local Homebrew constraint.
#
# Debian slim rather than Alpine: Next's image optimiser pulls in sharp, whose
# prebuilt binaries are glibc-first. Alpine works but adds a musl variant to
# reason about for no meaningful size win at this scale.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# pnpm version is pinned by the `packageManager` field in package.json.
RUN corepack enable


# ---- dependencies -----------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile


# ---- build ------------------------------------------------------------------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build needs a *reachable* commerce API, which is easy to miss.
#
# `cacheComponents` prerenders `use cache` scopes at build time, so `/products`
# and the PDP shells call listProducts/getProduct during `next build`. Suspense
# does not exempt them — that is the point of the pattern: the cached shell is
# materialised ahead of time. src/lib/env.ts being lazy avoids a *config* error,
# not the fetch itself.
#
# Consequence: whatever runs this build must sit on the private network. Not a
# secret (it is a hostname), but it does persist in this stage's image history,
# which is why it is an ARG and not baked into the runtime stage. The runtime
# value still comes from --env-file at `docker run`.
ARG COMMERCE_API_URL
ENV COMMERCE_API_URL=${COMMERCE_API_URL}
RUN test -n "$COMMERCE_API_URL" \
    || (echo "FATAL: --build-arg COMMERCE_API_URL is required (catalog prerender)" >&2; exit 1)

RUN pnpm build


# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# curl is here for the container HEALTHCHECK and the post-deploy gate.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# `output: 'standalone'` traces the runtime dependency graph, so node_modules
# and pnpm are deliberately absent from this stage.
# `.next/static` and `public/` are not traced and must be copied by hand.
# (This repo has no public/ directory yet — add a COPY line when it gains one.)
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/ >/dev/null || exit 1

CMD ["node", "server.js"]
