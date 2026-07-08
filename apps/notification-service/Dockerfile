# build stage
FROM node:22-alpine AS build
WORKDIR /repo
ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1

# Copy workspace configuration and dependencies locks
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json ./
COPY packages ./packages
COPY apps/notification-service ./apps/notification-service

RUN corepack enable && pnpm install --filter ...notification-service --frozen-lockfile

# Build the notification-service
RUN npx turbo run build --filter=notification-service

# runtime stage
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Copy node_modules and built packages to preserve workspace symbolic links
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/notification-service/node_modules ./apps/notification-service/node_modules
COPY --from=build /repo/apps/notification-service/dist ./apps/notification-service/dist
COPY --from=build /repo/apps/notification-service/package.json ./apps/notification-service/package.json

WORKDIR /repo/apps/notification-service
USER node
CMD ["node", "--import", "@irctc/telemetry/instrumentation", "dist/server.js"]
