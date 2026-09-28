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

# `cacheComponents` prerenders `use cache` scopes, so `next build` makes real
# catalog requests (see AGENTS.md § Verification). Two consequences:
#
#  1. A production image must be built somewhere that can reach the private
#     commerce API, so the prerendered /products shell holds real catalogue
#     data. That is BUILD_SCRIPT=build with COMMERCE_API_URL set.
#  2. Until that backend exists, BUILD_SCRIPT=build:ci builds against
#     scripts/mock-api.mjs. Useful for exercising this Dockerfile and the
#     Jenkins pipeline, but it bakes fixture products into the static shell —
#     never ship such an image to customers.
#
# COMMERCE_API_URL is a hostname, not a credential, but it does persist in this
# stage's image history, which is why it stays out of the runtime stage. The
# runtime value always comes from --env-file at `docker run`.
ARG STOREFRONT_BACKEND=commerce
ENV STOREFRONT_BACKEND=${STOREFRONT_BACKEND}
ARG BUILD_SCRIPT=build
ARG COMMERCE_API_URL
ENV COMMERCE_API_URL=${COMMERCE_API_URL}
RUN if [ "$STOREFRONT_BACKEND" != "hub" ] && [ "$BUILD_SCRIPT" = "build" ] && [ -z "$COMMERCE_API_URL" ]; then \
      echo "FATAL: --build-arg COMMERCE_API_URL is required for a production build" >&2; \
      exit 1; \
    fi

RUN --mount=type=secret,id=app_env \
    if [ -f /run/secrets/app_env ]; then set -a; . /run/secrets/app_env; set +a; fi; pnpm "$BUILD_SCRIPT"


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
# `.next/static` and `public/` are not traced and must be copied by hand —
# omitting either yields a running container that 404s every asset.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# Liveness, deliberately — not readiness. Docker's restart policy acts on this,
# and restarting the storefront does nothing about an unreachable commerce API
# except destroy a process that was still serving cached catalog pages. It used
# to curl `/`, which is prerendered: measured with the commerce API stopped, `/`,
# `/products` and `/products/merino-crew` all still returned 200. Readiness is
# `/health/ready`, and which deployment gates should use it is an open decision
# in docs/next-steps.md.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/health >/dev/null || exit 1

CMD ["node", "server.js"]
