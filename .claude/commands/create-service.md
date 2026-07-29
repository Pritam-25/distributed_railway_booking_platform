---
description: Scaffold a new microservice with the standard layout, container, server bootstrap, and health endpoints.
---

# Create a new microservice

You are scaffolding a new service in `apps/<service>/`. Before
writing code, read:

- [`.claude/rules/architecture.md`](../rules/architecture.md) — layered architecture and service template
- [`.claude/rules/bootstrap.md`](../rules/bootstrap.md) — `server.ts` startup sequence, graceful shutdown
- [`.claude/rules/api-design.md` is folded into `architecture.md`](../rules/architecture.md) — controllers, routes, response envelope
- [`.claude/rules/typescript.md`](../rules/typescript.md) — strict TS, path aliases, DTO shape
- [`.claude/rules/error-handling.md`](../rules/error-handling.md) — `ApiError`, `ERROR_CODES`, registry
- [`.claude/rules/imports-exports.md`](../rules/imports-exports.md) — barrel exports, path aliases, `.js` extensions
- [`.claude/skills/prisma-repository/SKILL.md`](../skills/prisma-repository/SKILL.md) — repository pattern, transactions
- [`.claude/skills/kafka-consumer/SKILL.md`](../skills/kafka-consumer/SKILL.md) — only if the service consumes Kafka
- [`.claude/skills/grpc-service/SKILL.md`](../skills/grpc-service/SKILL.md) — only if the service exposes or consumes gRPC
- [`.claude/skills/redis-cache/SKILL.md`](../skills/redis-cache/SKILL.md) — only if the service uses Redis
- [`.claude/skills/jsdoc/SKILL.md`](../skills/jsdoc/SKILL.md) — JSDoc standard

Pick a `<service>` name (kebab-case, e.g. `payment-service`). Confirm
the name with the user before generating more than one file.

## Step 1 — Project plumbing

Create `apps/<service>/`:

- `package.json` — copy from `apps/admin-service/package.json` and
  rename. Keep `@repo/...` workspace deps and the same scripts (`dev`,
  `build`, `prisma:generate`, `prisma:migrate`, `lint`, `check-types`).
- `tsconfig.json` — copy from `apps/admin-service/tsconfig.json`. Keep
  the same `paths` block (it's app-relative).
- `.env.example` — copy from `apps/admin-service/.env.example`. Update
  `PORT`, `SERVICE_NAME`, `KAFKA_CLIENT_ID`, `GRPC_PORT`
  defaults.
- `.gitignore` — copy from `apps/admin-service/.gitignore`.
- `prisma/schema.prisma` — minimal schema with one aggregate. Set the
  `output` to `../src/generated/prisma`.
- `prisma/migrations/migration_lock.toml` — copy from any sibling service.
- `prisma.config.ts` — copy from `apps/admin-service/prisma.config.ts`.

## Step 2 — `src/` layout

Create the canonical folders:

```
src/
├── api/v1/routes/
├── config/
├── container/
├── controllers/
├── dto/
├── mappers/
├── middleware/        # service-specific auth, etc.
├── repository/
├── services/
├── utils/errors/
├── workers/           # only if the service runs background work
├── consumers/         # only if the service consumes Kafka
├── grpc/              # only if the service exposes or consumes gRPC
├── app.ts
└── server.ts
```

Each folder gets an `index.ts` barrel — see the
[`imports-exports.md`](../rules/imports-exports.md) rule for the
canonical barrel shape and the canonical list of folders that need
barrels.

## Step 3 — Config

`src/config/`:

- `env.ts` — `createEnv` from `@t3-oss/env-core`, Zod schema for every
  required variable. Topic names default to `KAFKA_TOPICS.*` from
  `@irctc/contracts` when relevant.
- `prisma.ts` — exports `prisma` from `@generated/prisma/client.js`.
- `kafka.ts` — `kafka`, `getProducer`, `getProducerSync`,
  `isKafkaProducerReady`, `disconnectKafka`, `initKafka`, `getConsumer`.
  Mirror `apps/admin-service/src/config/kafka.ts`.
- `redis.ts` — only if the service uses Redis. Mirror
  `apps/notification-service/src/config/redis.ts`. Use the
  `createRedisClient` factory from `@irctc/redis`.
- `grpc.ts` — only if the service exposes gRPC. Wire the
  `startGrpcServer` / `stopGrpcServer` lifecycle to `server.ts`.
- `index.ts` — barrel.

## Step 4 — Error registry

`src/utils/errors/`:

- `errorCodes.ts` — start with the codes every service has:
  `INTERNAL_ERROR`, `INVALID_INPUT`. Add domain codes as you add
  aggregates. Use `COMMON_ERROR_CODES` from `@irctc/errors` as the
  foundation; add service-specific codes alongside.
- `errorMessages.ts` — `Record<ErrorCode, string>` with the matching
  messages.
- `index.ts` — re-exports.

`server.ts` calls `registerErrorMessages(ERROR_MESSAGES)` **before**
anything else.

## Step 5 — One end-to-end vertical slice

Pick the smallest meaningful aggregate for the service (e.g. a `Foo`
resource). Implement the full stack:

1. **DTO** in `src/dto/foo.dto.ts` — `createFooSchema`, `updateFooSchema`,
   `listFoosQuerySchema`, `fooIdParamSchema`. Re-export through
   `dto/index.ts`.
2. **Repository** in `src/repository/foo.repo.ts` — constructor takes
   `PrismaClient`, all writeable methods accept optional `tx`, no
   business logic. Follow the
   [`prisma-repository` skill](../skills/prisma-repository/SKILL.md).
3. **Event mapper** in `src/mappers/foo.mapper.ts` —
   `FooEventMapper.toCreatedEvent` / `toUpdatedEvent`, etc. Each
   method calls the versioned Zod schema's `.parse(...)`.
4. **Service** in `src/services/foo.service.ts` — DI constructor
   (`prisma`, `fooRepo`, `outboxRepo`). Multi-write flows in
   `prisma.$transaction` with an outbox insert (see
   [`prisma-repository/transactions.md`](../skills/prisma-repository/transactions.md),
   pattern A). All `ApiError`s use `COMMON_ERROR_CODES.*` /
   `ERROR_CODES.*` and `statusCode.*`.
5. **Outbox repository** in `src/repository/outbox.repo.ts` — copy
   from `apps/admin-service/src/repository/outbox.repo.ts` (and adjust
   for the new `outboxEvent` model in the new `schema.prisma`).
6. **Controller** in `src/controllers/foo.controller.ts` — one method
   per use case, body → service → response helper. No try/catch.
7. **Route** in `src/api/v1/routes/foo.routes.ts` — `Router()`,
   `validateSchema` / `validateParams` / `validateQuery`, `asyncHandler`,
   mount under `/foos` in `routes/index.ts`.
8. **Container** in `src/container/<service>.container.ts` — singleton
   with all repos, services, controllers. Public field per controller
   (and `outboxRepository` for the worker).
9. **Container barrel** in `src/container/index.ts`.

## Step 6 — Health routes

`src/api/v1/routes/health.routes.ts` — `GET /live` (no deps),
`GET /ready` (bounded checks for Prisma, Redis if used, Kafka
producer). `src/services/health.service.ts` — `runReadinessChecks([...])`
with `Promise.race` timeouts (≤5s).

`src/controllers/health.controller.ts` — `liveCheck` and `readyCheck`
handlers.

The full spec (probe shape, error handling) is in
[`bootstrap.md`](../rules/bootstrap.md).

## Step 7 — `app.ts` and `server.ts`

`app.ts` — middleware stack in the order from `bootstrap.md`: helmet,
cors, json/urlencoded, cookieParser, `requestIdMiddleware`,
`requestLoggerMiddleware`, `/health` router, `/api/v1` router,
`errorHandler`. Default export the app.

`server.ts` — startup sequence:

1. `registerErrorMessages(ERROR_MESSAGES)`.
2. `await prisma.$connect()`.
3. `await initRedis()` if the service uses Redis.
4. `await initKafka()`.
5. `await startGrpcServer(env.GRPC_PORT)` if the service exposes gRPC.
6. `await import("./app.js")` then `app.listen(PORT)`.
7. `Container.getInstance()`.
8. `new OutboxPublisherWorker(container.outboxRepository).start()` if
   the service produces events.
9. `await container.<eventName>Consumer.start()` for each Kafka
   consumer (one `await` per consumer).
10. `process.on("SIGINT" | "SIGTERM", () => void shutdown(...))`.
11. `process.on("unhandledRejection" | "uncaughtException", ...)` →
    `shutdown("...", 1)`.
12. Graceful shutdown: stop HTTP server, stop workers, stop consumers,
    disconnect Kafka, disconnect Redis (if used), stop gRPC server
    (if used), disconnect Prisma, shutdown telemetry, `process.exit`.

Wrap every step in a bounded `withTimeout(label, op, ms = 5000)` race.

## Step 8 — Contracts (only if the service publishes or consumes events)

If the new service publishes events to Kafka:

- Add the event schemas to
  `packages/contracts/src/<bounded-context>/<bounded-context>-events.v1.ts`.
  One file per bounded context. Always include `eventId` and
  `createdAt`.
- Add the topic names and DLQ topics to
  `packages/contracts/src/kafka/topics.ts`.
- Add the event types to `packages/contracts/src/kafka/event-types.ts`.
- Rebuild `@irctc/contracts` (`pnpm --filter @irctc/contracts build`).
- Default the env variables for the new topics in `src/config/env.ts`.

If the new service consumes events, follow the
[`kafka-consumer` skill](../skills/kafka-consumer/SKILL.md).

## Step 9 — gRPC (only if the service exposes or consumes gRPC)

- Edit `packages/contracts/proto/irctc/<bounded-context>/v1/<bounded-context>.proto`.
- Add the `service` block and message types per the proto conventions
  in [`grpc-service/SKILL.md`](../skills/grpc-service/SKILL.md).
- Run `pnpm --filter @irctc/contracts build` to regenerate the TS
  types and service definitions.
- Add the handler in `src/grpc/<bounded-context>.handler.ts` —
  implements `InventoryServiceImplementation` (or the equivalent for
  the new service) with thin handlers that delegate to a service.
- Add the client singleton in `src/grpc/<bounded-context>.client.ts`
  if other services will call into this one.
- Wire `startGrpcServer` / `stopGrpcServer` into `server.ts`.
- Re-export through `src/grpc/index.ts`.

The default `ERROR_CODES.VALIDATION_ERROR` and
`ERROR_CODES.BAD_REQUEST` are dead — use `COMMON_ERROR_CODES.INVALID_INPUT`
and a domain code instead. See
[`grpc-service/drift.md`](../skills/grpc-service/drift.md).

## Step 10 — Verify

- `pnpm install` at the repo root.
- `pnpm --filter <service> prisma generate`.
- `pnpm --filter <service> prisma migrate dev --name init`.
- `pnpm --filter <service> check-types` — must be clean.
- `pnpm --filter <service> lint` — must be clean.
- `pnpm --filter <service> dev` — confirm `/health/live` returns 200
  and the new endpoint works.

## Step 11 — Update the public contract (only if the service exposes REST)

If the service exposes REST endpoints, add it to the OpenAPI pipeline:

- Add `OpenAPIRegistry` entries in `apps/<service>/src/openapi/registry.ts`.
- Add the service entry to `scripts/services.config.ts` with
  `publish: true`, the right `displayName`, the right `tags`, and
  `generateSdk` if the service's endpoints should land in the
  frontend SDK.
- Add the service to `turbo.json`'s `api-gateway#build:spec.dependsOn`
  list.
- Run `pnpm turbo run build:spec` and verify the new endpoints appear
  in `apps/api-gateway/openapi.yaml`.

See the [`openapi`](../skills/openapi/SKILL.md) skill for the
contracts, layer invariants, and common mistakes.

## Step 12 — Tell the user

List every file you created. Highlight the gaps you left for them to
fill in (any service-specific aggregates beyond the one vertical slice,
consumer wiring if the service will consume Kafka, etc.).
