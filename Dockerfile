# syntax=docker/dockerfile:1.7
#
# Parameterized Dockerfile for IRCTC Node.js backend microservices.
# (Note: Frontend Next.js app uses dedicated `Dockerfile.web`).
#
# Build a specific backend service with:
#
#   docker build --build-arg SERVICE=inventory-service -t irctc-inventory-service .

# ==========================================================
# Stage 0a — Shared build base image with pnpm & turbo pre-installed
# ==========================================================
FROM node:22-slim AS base

WORKDIR /repo

ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install pnpm and turbo ONCE in the base image. Because this stage has no
# ARG SERVICE, Docker BuildKit builds and caches this layer EXACTLY ONCE across
# all microservices, preventing parallel npm network contention.
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 10 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 180000 \
 && npm config set fetch-timeout 600000 \
 && npm install -g pnpm@11.17.0 turbo@2.9.18 --ignore-scripts

# ==========================================================
# Stage 0b — Shared runtime base image with health probe toolchain
# ==========================================================
FROM node:22-slim AS runtime_base

# Install wget & copy gRPC health probe binary ONCE across all microservices.
# Because this stage has no ARG SERVICE, Docker BuildKit resolves ghcr.io metadata
# EXACTLY ONCE, preventing parallel gRPC connection drops during docker compose build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/grpc-ecosystem/grpc-health-probe:v0.4.35 /ko-app/grpc-health-probe /usr/local/bin/grpc_health_probe

# ==========================================================
# Stage 1 — Prune the monorepo to just this service's deps
# ==========================================================
FROM base AS pruner

ARG SERVICE

# `pnpm-lock.yaml` is required: `turbo prune` reads it to compute which
# transitive dependencies belong in `out/json/`.
COPY package.json pnpm-lock.yaml turbo.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN turbo prune "${SERVICE}" --docker

# ==========================================================
# Stage 2 — Install full deps, build, and deploy to /deploy
# ==========================================================
FROM base AS build

ARG SERVICE
ENV npm_config_nodedir=/usr/local

# Build toolchain required by `pnpm rebuild @confluentinc/kafka-javascript`
# (librdkafka native bindings).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
 && rm -rf /var/lib/apt/lists/*

# Copy the pruned manifests only — Docker can cache this layer until the
# lockfile for this service changes.
COPY --from=pruner /repo/out/json/ ./

RUN echo "verify-deps-before-run=false" > .npmrc \
 && echo "network-concurrency=1"         >> .npmrc \
 && echo "fetch-retries=5"               >> .npmrc \
 && echo "fetch-retry-mintimeout=10000"  >> .npmrc \
 && echo "fetch-retry-maxtimeout=60000"  >> .npmrc \
 && echo "fetch-timeout=300000"          >> .npmrc

# Shared cache mount across services so common monorepo packages are downloaded once and reused locally.
# sharing=locked prevents parallel Docker Compose service builds from corrupting shared store cache.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts --filter="${SERVICE}..." \
 && pnpm rebuild

# Bring in the full source tree.
COPY --from=pruner /repo/out/full/ ./

# Generate Prisma client only when the service owns a Prisma schema.
# Mount /root/.cache/prisma so downloaded Prisma engine binaries are cached across Docker builds.
RUN --mount=type=cache,id=prisma-cache,target=/root/.cache/prisma,sharing=locked \
    if [ -f "apps/${SERVICE}/prisma/schema.prisma" ]; then \
       pnpm --filter="${SERVICE}" exec prisma generate; \
    fi

# Build the service and its workspace dependencies.
RUN turbo run build --filter="${SERVICE}"

# Produce a flat, standalone production deployment package.
# --legacy is required because this workspace uses a shared lockfile and
# does not use inject-workspace-packages.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm,sharing=locked \
    pnpm --filter="${SERVICE}" deploy /deploy --prod --legacy --prefer-offline

# ==========================================================
# Stage 3 — Runtime
# ==========================================================
FROM runtime_base AS runtime

WORKDIR /deploy

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Run as the non-root `node` user from the official base image.
USER node

COPY --from=build /deploy ./

EXPOSE 4000

CMD ["node", "--import", "@irctc/telemetry/instrumentation", "dist/server.js"]
