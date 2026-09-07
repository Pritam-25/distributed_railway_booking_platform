# build stage
FROM node:22-slim AS build
WORKDIR /repo
ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1
ENV npm_config_nodedir=/usr/local

# Build toolchain required by @confluentinc/kafka-javascript native bindings
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
 && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json ./
COPY packages ./packages
COPY scripts ./scripts

RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 10 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 180000 \
 && npm config set fetch-timeout 600000 \
 && TURBO_VERSION=$(node -e "console.log(require('./package.json').devDependencies.turbo.replace(/^[~^]/, ''))") \
 && npm install -g "pnpm@11.17.0" "turbo@${TURBO_VERSION}" --ignore-scripts

# Configure pnpm network limits & cache mount to avoid registry timeouts when parallel builds run
RUN echo "verify-deps-before-run=false" > .npmrc \
 && echo "network-concurrency=1"         >> .npmrc \
 && echo "fetch-retries=5"               >> .npmrc \
 && echo "fetch-retry-mintimeout=10000"  >> .npmrc \
 && echo "fetch-retry-maxtimeout=60000"  >> .npmrc \
 && echo "fetch-timeout=300000"          >> .npmrc

# Install dependencies only for kafka-init, root, and required packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm,sharing=locked \
    pnpm install \
      --ignore-scripts \
      --frozen-lockfile \
      --filter=@irctc/kafka... \
      --filter=@irctc/contracts... \
      --filter=@irctc/logger... \
 && pnpm rebuild -r

# Build contracts, kafka, and logger packages
RUN turbo run build --filter=@irctc/contracts --filter=@irctc/kafka --filter=@irctc/logger

# runtime stage
FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

USER node

COPY --chown=node:node --from=build /repo/node_modules ./node_modules
COPY --chown=node:node --from=build /repo/packages ./packages
COPY --chown=node:node --from=build /repo/scripts ./scripts
COPY --chown=node:node --from=build /repo/package.json ./package.json

CMD ["./node_modules/.bin/tsx", "scripts/create-kafka-topics.mts"]
