# build stage
FROM node:22-alpine AS build
WORKDIR /repo
ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json ./
COPY packages ./packages
COPY scripts ./scripts

# Install dependencies for packages and root
RUN corepack enable && pnpm install --frozen-lockfile

# Build contracts and kafka packages
RUN npx turbo run build --filter=@irctc/contracts --filter=@irctc/kafka

# runtime stage
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/scripts ./scripts
COPY --from=build /repo/package.json ./package.json

CMD ["npx", "tsx", "scripts/create-kafka-topics.mts"]
