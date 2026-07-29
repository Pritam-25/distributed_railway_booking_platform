---
description: Review the current diff for correctness bugs and rule violations against the project's conventions.
---

You are running a code review against the project rules. Read every
relevant file in [`.claude/rules/`](../rules/) first, then run the steps
below.

## Step 1 — Scope the review

1. Run `git diff --stat HEAD` to list the changed files.
2. Run `git diff HEAD` to capture the full diff.
3. Group the diff by layer (route, controller, service, repository,
   mapper, dto, kafka, redis, grpc, config, schema, test) — review
   each layer against its specific rule file and skill.

## Step 2 — Per-layer checklist

For every file in the diff, walk the relevant rule. If a finding has
no concrete file/line reference, drop it.

### Routes (`src/api/v1/routes/**`)

- [ ] Handler is wrapped in `asyncHandler`.
- [ ] Body / param / query are validated through `validateSchema` /
      `validateParams` / `validateQuery`.
- [ ] DTOs are imported from `@dto`, not the leaf file.
- [ ] No business logic, no Prisma / Redis / Kafka / gRPC calls.
- [ ] Mounted in `routes/index.ts` if new.

### Controllers (`src/controllers/**`)

- [ ] Receives a service via constructor DI.
- [ ] Method body is body → service call → response helper.
- [ ] Uses `successResponse` / `paginatedResponse` and `statusCode.*`.
- [ ] No `try` / `catch` around the service call (errors propagate to
      `errorHandler`).
- [ ] Re-exported through `controllers/index.ts`.

### Services (`src/services/**`)

- [ ] Constructor takes Prisma + repositories via DI.
- [ ] No `prisma.<model>.<verb>` direct access — uses repository.
- [ ] Exception: cross-aggregate reads inside `prisma.$transaction`
      may use `tx.<model>` (see
      [prisma-repository/transactions.md](../skills/prisma-repository/transactions.md)).
- [ ] Multi-write operations are inside `prisma.$transaction`
      (one of the four patterns in `transactions.md`).
- [ ] Outbox events inserted in the same transaction as the state
      change. See [`prisma-repository` skill](../skills/prisma-repository/SKILL.md).
- [ ] All `ApiError`s use `ERROR_CODES.*` / `COMMON_ERROR_CODES.*` and
      `statusCode.*`.
- [ ] No raw strings for error codes or messages. Service-specific
      codes (`ERROR_CODES.*`) carry their message via the registry;
      throwing sites pass only the code. `COMMON_ERROR_CODES.*`
      throwing sites may pass a specific message override as the
      third arg when the generic `COMMON_ERROR_MESSAGES` default is
      too vague — the override should name the failing field or
      condition and match the registry voice. Recommended but not
      required. See [`error-handling.md`](../rules/error-handling.md)
      ("Throwing `ApiError` correctly").
- [ ] Prisma errors translated (P2002 → conflict, P2025 → notFound,
      P2003 → badRequest) — via `normalizePrismaError` from
      `@irctc/errors` or caught and re-thrown with a domain code.
- [ ] gRPC callers catch `ClientError` and translate via
      `mapClientErrorToApiError` (or equivalent — never let
      `ClientError` reach a controller).

### Repositories (`src/repository/**`)

- [ ] Constructor takes the `PrismaClient`.
- [ ] All writeable methods accept an optional `tx?: Prisma.TransactionClient`
      and use it when provided.
- [ ] Typed with `Prisma.<Model>*Input` / `WhereInput` — no `any`.
- [ ] Re-exported through `repository/index.ts`.

### Mappers (`src/mappers/**`)

- [ ] Static methods, one per event shape.
- [ ] Validates the outgoing payload with the versioned Zod schema's
      `.parse(...)`.
- [ ] Mints a fresh `eventId: crypto.randomUUID()`.
- [ ] No I/O, no throws other than Zod's `parse`.

### DTOs (`src/dto/**`)

- [ ] Zod schema + inferred type only.
- [ ] Strings trimmed, query numerics preprocessed.
- [ ] ID params use `.uuid("...")`.
- [ ] Re-exported through `dto/index.ts`.

### Kafka — consumers (`src/consumers/**`, `src/workers/**`)

- [ ] Consumer uses `wrapWithDlq` (or returns `PROCESSING_STATUS.INVALID`
      on schema failure — but pick one per service). See
      [`kafka-consumer` skill](../skills/kafka-consumer/SKILL.md).
- [ ] Idempotency before side effects. External side effects use the
      Redis two-phase pattern from
      [`idempotency.md`](../skills/kafka-consumer/idempotency.md).
      DB side effects use Prisma `IdempotencyRepository` inside the
      same transaction.
- [ ] `eventKey` is `eventId` or a domain-stable composite — never PII.
- [ ] Outbox worker: `start()` is idempotent, `stop()` clears all
      timers.
- [ ] Outbox row carries `SCHEMA_VERSION: "1"` and `EVENT_TYPE`
      headers.
- [ ] Heartbeat in `finally`.

### Redis (`src/config/redis.ts`, cache wrappers)

- [ ] Client created via `createRedisClient` from `@irctc/redis`.
- [ ] Cache keys prefixed `cache:`, lock keys prefixed `lock:`.
- [ ] TTL on every key.
- [ ] No PII in cached values.
- [ ] `/health/ready` includes `checkRedis` wrapped in 5s `Promise.race`.
- [ ] `del` in `finally` for every `SET NX EX` lock.

### gRPC (`src/grpc/**`, `packages/contracts/proto/**`)

- [ ] Handlers throw `ApiError` — `mapToGrpcError` translates at the
      wire. See [`grpc-service` skill](../skills/grpc-service/SKILL.md).
- [ ] Clients are singletons; one `Channel` per remote service.
- [ ] `defaultTimeoutMs` set on every `createGrpcClient` call.
- [ ] All types come from `@irctc/contracts` (buf-generated) — never
      hand-written.
- [ ] `ClientError` is translated to `ApiError` at the caller
      boundary; never reaches a controller.
- [ ] **No dead codes** — never reference `ERROR_CODES.VALIDATION_ERROR`
      or `ERROR_CODES.BAD_REQUEST`. See
      [`drift.md`](../skills/grpc-service/drift.md).

### Logging

- [ ] No `email`, `firstName`, `lastName`, `phone`, `address`,
      `dateOfBirth` in any log bound object.
- [ ] No full `req.body` / `req.user` / event payload / gRPC request /
      DTO.
- [ ] Errors logged with `err: error` (the canonical key).
- [ ] PII-free identifiers used: `eventId`, `userId`, `sessionId`,
      `aggregateId`, `requestId`.
- [ ] New `REDACT_PATHS` entries go in `packages/logger/src/constants.ts`,
      not in the service.

### TypeScript

- [ ] No `any`.
- [ ] No `as` casts outside mappers and Prisma tx clients.
- [ ] No `// @ts-ignore` / `// @ts-expect-error` without a justifying
      comment.
- [ ] Public methods have explicit return types.
- [ ] Class fields are `readonly` when not reassigned.
- [ ] Named exports only.
- [ ] `*.js` extension on every relative import (verbatimModuleSyntax).

### Bootstrap

- [ ] New service has `server.ts` that follows the startup sequence
      (register errors → connect Prisma → init Redis → init Kafka →
      start gRPC → app.listen → start workers).
- [ ] Graceful shutdown drains HTTP, stops workers, disconnects
      Kafka/Redis/gRPC/Prisma in order.
- [ ] `/health/live` does not call dependencies.
- [ ] `/health/ready` wraps every dependency probe in a bounded
      `Promise.race` (≤5s) with `clearTimeout` in `finally`.
- [ ] Readiness checks never throw — they return `{ ok: false, error }`.

## Step 3 — Output

Produce a structured review. For each finding, include:

- **Layer** — e.g. `services/train.service.ts`
- **Rule** — which rule it violates (link to the rule file or skill)
- **Severity** — blocker / important / nit
- **Fix** — concrete code suggestion (or a "see file" pointer if the
  change is large)

If the diff is clean, say so. Do not invent issues to fill the page.
