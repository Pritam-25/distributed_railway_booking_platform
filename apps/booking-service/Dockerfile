# --- Pruner stage ---
FROM node:22-alpine AS pruner
WORKDIR /repo
ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1

# Copy workspace configuration and prune for booking-service
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN corepack enable \
 && npm install -g turbo@2.9.18 \
 && pnpm exec turbo prune booking-service --docker

# --- Installer + builder + deploy ---
FROM pruner AS build
WORKDIR /repo

# Install workspace dependencies (no-frozen-lockfile is required for pruned lockfile)
COPY --from=pruner /repo/out/json ./
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Copy full pruned source and build
COPY --from=pruner /repo/out/full ./
RUN pnpm --filter booking-service exec prisma generate \
 && npx turbo run build --filter=booking-service

# Deploy flat standalone package to /deploy
RUN pnpm --filter booking-service deploy /deploy --prod

# --- Runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /deploy
ENV NODE_ENV=production

COPY --from=build /deploy ./

EXPOSE 4002
USER node
CMD ["node", "--import", "@irctc/telemetry/instrumentation", "dist/server.js"]
