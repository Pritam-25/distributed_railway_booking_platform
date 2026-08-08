# build stage
FROM node:22-slim AS build
WORKDIR /repo
ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1

# Build toolchain required by @confluentinc/kafka-javascript native bindings
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.17.0 --ignore-scripts

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json ./
COPY packages ./packages
COPY scripts ./scripts

# Configure pnpm network limits & cache mount to avoid registry timeouts when parallel builds run
RUN echo "verify-deps-before-run=false" > .npmrc \
 && echo "network-concurrency=2"         >> .npmrc \
 && echo "fetch-retries=15"              >> .npmrc \
 && echo "fetch-retry-mintimeout=20000"  >> .npmrc \
 && echo "fetch-retry-maxtimeout=180000" >> .npmrc \
 && echo "fetch-timeout=600000"          >> .npmrc

# Install dependencies for packages and root
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --ignore-scripts --frozen-lockfile \
 && pnpm rebuild -r @confluentinc/kafka-javascript

# Build contracts, kafka, and logger packages
RUN pnpm exec turbo run build --filter=@irctc/contracts --filter=@irctc/kafka --filter=@irctc/logger

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
