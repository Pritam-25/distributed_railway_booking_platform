# syntax=docker/dockerfile:1.7
#
# Dedicated Dockerfile for the IRCTC Next.js Web Frontend.
#
# Uses Next.js `output: "standalone"` build mode for minimal image size
# and fast production startup.

# ==========================================================
# Stage 0 — Shared base image with pnpm & turbo pre-installed
# ==========================================================
FROM node:22-slim AS base

WORKDIR /repo

ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 10 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 180000 \
 && npm config set fetch-timeout 600000 \
 && npm install -g pnpm@11.17.0 turbo@2.9.18 --ignore-scripts

# ==========================================================
# Stage 1 — Prune the monorepo to just web workspace deps
# ==========================================================
FROM base AS pruner

COPY package.json pnpm-lock.yaml turbo.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN turbo prune web --docker

# ==========================================================
# Stage 2 — Install deps & build standalone Next.js package
# ==========================================================
FROM base AS builder

COPY --from=pruner /repo/out/json/ ./

RUN echo "verify-deps-before-run=false" > .npmrc \
 && echo "network-concurrency=1"         >> .npmrc \
 && echo "fetch-retries=5"               >> .npmrc \
 && echo "fetch-retry-mintimeout=10000"  >> .npmrc \
 && echo "fetch-retry-maxtimeout=60000"  >> .npmrc \
 && echo "fetch-timeout=300000"          >> .npmrc

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts --filter=web...

COPY --from=pruner /repo/out/full/ ./

RUN turbo run build --filter=web

# ==========================================================
# Stage 3 — Runtime
# ==========================================================
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER node

# Copy standalone output from Next.js build
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
