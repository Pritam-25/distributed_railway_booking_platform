# build stage
FROM node:22-alpine AS build
WORKDIR /repo
ENV CI=true
ENV TURBO_TELEMETRY_DISABLED=1

# Copy workspace configuration and dependencies locks
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json ./
COPY packages ./packages
COPY apps/user-service ./apps/user-service

RUN corepack enable && pnpm install --filter ...user-service --frozen-lockfile

# Generate Prisma client before building typescript
RUN pnpm --filter user-service exec prisma generate

# Build the user-service
RUN npx turbo run build --filter=user-service

# runtime stage
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Copy node_modules and built packages to preserve workspace symbolic links
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/user-service/node_modules ./apps/user-service/node_modules
COPY --from=build /repo/apps/user-service/dist ./apps/user-service/dist
COPY --from=build /repo/apps/user-service/package.json ./apps/user-service/package.json
COPY --from=build /repo/apps/user-service/prisma ./apps/user-service/prisma
COPY --from=build /repo/apps/user-service/prisma.config.ts ./apps/user-service/prisma.config.ts

WORKDIR /repo/apps/user-service
EXPOSE 4001
USER node
CMD ["node", "--import", "@irctc/telemetry/instrumentation", "dist/server.js"]
