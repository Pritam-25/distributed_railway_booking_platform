# syntax=docker/dockerfile:1.7
#
# Single, parameterized Dockerfile for every IRCTC application service.
# Build a specific service with:
#
#   docker build --build-arg SERVICE=user-service -t irctc-user-service .
#
# The SERVICE argument drives `turbo prune`, the optional Prisma generate
# step, the build filter, and the deploy filter.
#
# Why this exists: six per-service Dockerfiles caused `pnpm install` to run
# six times in parallel during `docker compose build`. Each install pounded
# registry.npmjs.org, hitting rate limits and socket timeouts. This file
# shares every cacheable layer between services and configures pnpm with
# knobs that survive parallel registry contention.

# ==========================================================
# Stage 1 — Prune the monorepo to just this service's deps
# ==========================================================
FROM node:22-slim AS pruner

ARG SERVICE

WORKDIR /repo

ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1

# Install only the `turbo` binary globally — `turbo prune` only needs
# the workspace structure, not the full dependency graph, so we skip
# a full `pnpm install` here. The pruned output (out/json) drives the
# install in the build stage.
#
# `pnpm-lock.yaml` is required: `turbo prune` reads it to compute which
# transitive dependencies belong in `out/json/`. Without it, prune aborts
# with "Cannot prune without parsed lockfile".
COPY package.json pnpm-lock.yaml turbo.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

# Pin the turbo version to whatever is in the root package.json so the
# build stays reproducible. `npm install -g turbo@<version>` is a single
# small registry fetch per build, replacing the previous pattern of
# running a full `pnpm install` against the entire monorepo lockfile.
RUN TURBO_VERSION=$(node -e "console.log(require('./package.json').devDependencies.turbo.replace(/^[~^]/, ''))") \
 && npm install -g "pnpm@11.17.0" "turbo@${TURBO_VERSION}" --ignore-scripts \
 && turbo prune "${SERVICE}" --docker

# ==========================================================
# Stage 2 — Install full deps, build, and deploy to /deploy
# ==========================================================
FROM node:22-slim AS build

ARG SERVICE

WORKDIR /repo

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@11.17.0 --ignore-scripts

# Build toolchain required by `pnpm rebuild @confluentinc/kafka-javascript`
# (librdkafka native bindings). Carried only by the build stage, never the
# runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
 && rm -rf /var/lib/apt/lists/*

# Copy the pruned manifests only — Docker can cache this layer until the
# lockfile for this service changes.
COPY --from=pruner /repo/out/json/ ./

# Install with knobs that keep pnpm polite when six builds run together.
# `--config.<kebab>=value` coerces everything to string and trips pnpm 11.17's
# numeric parsers ("Expected `concurrency` to be a number … got `8` (string)").
# Settings are written to `.npmrc` instead — pnpm parses these natively and
# the file is local to this stage (never reaches the runtime image).
#
#   verify-deps-before-run=false  skip per-attestation fetch (also: see
#                                 `trustLockfile: true` in
#                                 pnpm-workspace.yaml)
#   network-concurrency=8         cap parallel registry sockets
#   fetch-retries=10              survive transient undici socket drops;
#                                 bumped from 5 because pnpm-bundled
#                                 installers (e.g. node-pre-gyp) retry
#                                 independently of the registry step
#   fetch-timeout=300000          ms per registry request (5 min); bumped
#                                 from 60s so the per-package installer
#                                 survives GitHub's anti-throttle on
#                                 parallel release-asset downloads
RUN echo "verify-deps-before-run=false" > .npmrc \
 && echo "network-concurrency=2"         >> .npmrc \
 && echo "fetch-retries=15"              >> .npmrc \
 && echo "fetch-retry-mintimeout=20000"  >> .npmrc \
 && echo "fetch-retry-maxtimeout=180000" >> .npmrc \
 && echo "fetch-timeout=600000"          >> .npmrc

# Per-service cache mount. Scoping the ID by ${SERVICE} stops the six
# parallel builds from queueing on a single shared cache lock; each build
# now reads from its own warm store and writes back at the end.
#
# Why this still works in parallel: each install copies roughly the same
# ~830 packages. `network-concurrency=8` caps pnpm's per-process socket
# pool, so even though 6 builds run together, pnpm opens at most 8
# sockets per process (48 total) — well under registry rate limits.
# Shared cache mount across services so common monorepo packages are downloaded once.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm rebuild

# Bring in the full source tree.
COPY --from=pruner /repo/out/full/ ./

# Install `turbo` globally in the build stage as well, pinned to the
# version declared in the root `package.json`. This avoids a second
# `pnpm install` against the lockfile (which would need to be combined
# with `--frozen-lockfile` to keep dependency resolution locked) and
# keeps the global binary on PATH for the `turbo run build` step below.
RUN TURBO_VERSION=$(node -e "console.log(require('./package.json').devDependencies.turbo.replace(/^[~^]/, ''))") \
 && npm install -g "turbo@${TURBO_VERSION}" --ignore-scripts

# Generate Prisma client only when the service owns a Prisma schema. The
# three services with one today are user-service, admin-service, and
# inventory-service. api-gateway, notification-service, and search-service
# have no `prisma/schema.prisma`, so the prisma binary isn't installed
# and `pnpm exec prisma` errors with "Command prisma not found". The `if`
# guard prevents the noisy error on every build; the runtime `prisma
# migrate deploy` step in compose handles regeneration if needed.
RUN if [ -f "apps/${SERVICE}/prisma/schema.prisma" ]; then \
       pnpm --filter="${SERVICE}" exec prisma generate || true; \
    fi

# Build the service and its workspace dependencies.
RUN turbo run build --filter="${SERVICE}"

# Produce a flat, standalone deployment package.
RUN pnpm --filter="${SERVICE}" deploy /deploy --prod --legacy

# ==========================================================
# Stage 3 — Runtime
# ==========================================================
FROM node:22-slim AS runtime

WORKDIR /deploy

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Run as the non-root `node` user from the official base image.
USER node

COPY --from=build /deploy ./

EXPOSE 4000

CMD ["node", "--import", "@irctc/telemetry/instrumentation", "dist/server.js"]
