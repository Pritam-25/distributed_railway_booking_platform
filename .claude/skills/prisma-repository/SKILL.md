---
description: Write a Prisma repository in a service. Covers constructor takes PrismaClient, writeable methods accept optional TransactionClient, error mapping for P2002/P2025/P2003, outbox insert in the same transaction, and the cross-aggregate read exception. Triggers on adding src/repository/<entity>.repo.ts or wiring a service that calls prisma.* through a repository.
when_to_use: "Adding a new repository, threading an existing repository through a service transaction, adding the outbox insert alongside a state change, or translating Prisma error codes to ApiError."
---

# prisma-repository

Every Prisma call in this platform lives behind a repository. Services
never call `prisma.*` directly. Controllers never see Prisma at all.
This skill is the creation workflow for repositories and the rules
for threading them through service transactions.

Layer invariants (the layered architecture, why services don't call
Prisma, what the cross-aggregate read exception is) live in
`rules/architecture.md` and `rules/error-handling.md`. This skill is
the workflow.

## The repository contract

```
apps/<service>/src/repository/
├── <entity>.repo.ts        ← one file per aggregate
├── outbox.repo.ts         ← required for any service that publishes events
└── index.ts               ← barrel re-exporting every repo
```

For every repository:

1. **One file per aggregate.** `TrainRepository`, `ScheduleRepository`,
   `OutboxRepository`.
2. **Constructor takes `PrismaClient`.** Services receive the repo via
   container DI.
3. **Writeable methods accept an optional `tx`.** Read methods follow
   the same pattern when they can be called from inside a service
   transaction.
4. **No business logic.** Repositories are pure data-access wrappers;
   the service orchestrates business flows on top.
5. **Re-export through `src/repository/index.ts`** as a barrel.

## When this skill runs

Trigger on any of:

- "Add a repository for `<Entity>`"
- "Thread the existing repository through a transaction"
- "Translate Prisma error P2002 to ApiError"
- Changes under `apps/<svc>/src/repository/`.

Do **not** trigger for:

- REST API design — `openapi` skill.
- gRPC handlers — `grpc-service` skill.
- Kafka consumer creation — `kafka-consumer` skill.
- JSDoc on the repository methods themselves — `jsdoc` skill.

## Source of truth — `@irctc/errors`

`@irctc/errors` ships `normalizePrismaError` for the common case
(P2002 → CONFLICT, P2025 → NOT_FOUND, P2003 → INVALID_INPUT,
everything else → INTERNAL_ERROR). When you need a domain-specific
code (e.g. `TRAIN_ALREADY_EXISTS` instead of `CONFLICT`), catch
`Prisma.PrismaClientKnownRequestError` in the **service**, not the
repository, and throw the domain `ApiError`. Repositories throw
`ApiError` only when the mapping is genuinely generic (e.g. `NOT_FOUND`).

## Step 1 — Add the repository file

`apps/<service>/src/repository/<entity>.repo.ts`. The canonical shape
(in `apps/admin-service/src/repository/train.repo.ts`):

```ts
import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import type { <Entity>Filters } from "@dto";
import type { PaginationOptions } from "@irctc/http";

/**
 * Repository handling database access for the <Entity> aggregate.
 *
 * Responsibilities:
 * - All Prisma queries against the `<entity>` table
 * - Transaction propagation via the optional `tx` parameter
 *
 * Forbidden:
 * - Business logic (validation, error mapping beyond generic normalize)
 * - Cross-aggregate reads (use a different repository)
 * - Kafka / Redis / network I/O
 */
export class <Entity>Repository {
  constructor(private readonly prisma: PrismaClient) {}

  async getById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.<entity>.findFirst({ where: { id, isActive: true } });
  }

  async create(data: Prisma.<Entity>CreateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.<entity>.create({ data });
  }

  async update(
    id: string,
    data: Prisma.<Entity>UpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.<entity>.update({ where: { id }, data });
  }

  async list(
    filters: <Entity>Filters,
    pagination: PaginationOptions,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.<entity>.findMany({
      where: { ...filters, isActive: true },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });
  }
}
```

Conventions:

- **Constructor takes `PrismaClient`, not the service's `prisma`
  singleton.** Container DI wires the singleton in; tests can pass a
  mock or a transactional client.
- **`tx` is the last parameter on every writeable method.** Reads
  follow the same pattern when they can be invoked from inside a
  service transaction.
- **`const client = tx ?? this.prisma;` is the first line of every
  method.** Don't inline the ternary — it makes audit (`grep -A 1
"tx ?? this.prisma"`) easy.
- **Method names mirror service verbs.** `getById`, `create`,
  `update`, `list`, `markPublished`, `markFailed`. Not Prisma verb
  names (`findFirst`, `findUnique`) — those leak the ORM.
- **All `Prisma.*Input` types, never `any`.** `Prisma.<Entity>CreateInput`,
  `Prisma.<Entity>UpdateInput`, `Prisma.<Entity>WhereInput`.
- **`isActive: true`** is in every default `where` — soft delete is
  the convention, not a query toggle.

## Step 2 — Re-export through the barrel

`apps/<service>/src/repository/index.ts`:

```ts
export * from "./train.repo.js";
export * from "./<entity>.repo.js";
export * from "./outbox.repo.js";
```

Services import from `@repository`, never from the leaf file. See
`rules/imports-exports.md`.

## Step 3 — Wire the repository through a service transaction

The repository accepts a `tx`; the service decides whether to start a
transaction. Pattern:

```ts
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";

async createTrain(dto: CreateTrainRequestDto): Promise<Train> {
  return await this.prisma.$transaction(async (tx) => {
    const existing = await this.trainRepository.getTrainByNumber(
      dto.trainNumber,
      tx,
    );
    if (existing) {
      throw new ApiError(statusCode.conflict, ERROR_CODES.TRAIN_ALREADY_EXISTS);
    }

    const train = await this.trainRepository.create(data, tx);
    await this.outboxRepository.insert(tx, {
      aggregateType: "Train",
      aggregateId: train.id,
      eventType: "TRAIN_CREATED",
      topic: KAFKA_TOPICS.ADMIN_TRAIN_CREATED,
      payload: TrainEventMapper.toCreatedEvent(train),
      headers: { [KAFKA_HEADERS.SCHEMA_VERSION]: "1", [KAFKA_HEADERS.EVENT_TYPE]: "TRAIN_CREATED" },
    });
    return train;
  });
}
```

Key rules:

- **Every writeable call inside the transaction gets the `tx`** — if
  any call forgets, the state change and the outbox insert won't
  commit atomically.
- **Return value comes from `$transaction`, not from a nested helper**
  that swallows the tx. Returning inside the callback is the only
  way the framework resolves the value to the caller.
- **Never `await` Kafka publish, Redis, gRPC, or external HTTP inside
  the transaction body.** Locks held during network I/O are a
  deadlock risk. The outbox publisher worker drains the table after
  commit.
- **Multi-write operations MUST run inside `$transaction`.** A
  state-change + outbox-insert without `$transaction` loses events
  on commit failure.

## Step 4 — Translate Prisma errors to ApiError

### Common case (use `normalizePrismaError`)

```ts
import { normalizePrismaError } from "@irctc/errors";

async createTrain(dto: CreateTrainRequestDto): Promise<Train> {
  try {
    return await this.prisma.$transaction(async (tx) => {
      // ...
    });
  } catch (error) {
    const code = normalizePrismaError(error);
    if (code === COMMON_ERROR_CODES.CONFLICT) {
      throw new ApiError(statusCode.conflict, ERROR_CODES.TRAIN_ALREADY_EXISTS);
    }
    throw error;
  }
}
```

`normalizePrismaError` returns one of `CONFLICT | NOT_FOUND | INVALID_INPUT | INTERNAL_ERROR | null`. The `null` case means the error isn't a Prisma known error — rethrow it untouched.

### Domain-specific case (catch and re-throw)

When the error code isn't enough and the service knows what it
means:

```ts
try {
  return await this.prisma.$transaction(async (tx) => {
    // ...
  });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    throw new ApiError(statusCode.notFound, ERROR_CODES.SCHEDULE_NOT_FOUND);
  }
  throw error;
}
```

The mapping lives in the service, never the repository. The
repository returns the raw Prisma result or throws a Prisma error;
the service decides what the user-facing code is.

## Step 5 — Outbox insert in the same transaction

`apps/<service>/src/repository/outbox.repo.ts` is the canonical
pattern. Every service that publishes events has one. The contract:

```ts
class OutboxRepository {
  insert(
    tx: Prisma.TransactionClient,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      topic: string;
      payload: unknown; // already validated against the contract schema
      headers?: Record<string, string>;
    },
  ): Promise<OutboxEvent>;

  claimPendingEvents(batchSize: number): Promise<OutboxEvent[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: Error, retryCount: number): Promise<void>;
  markDead(id: string): Promise<void>;
  resetStuckProcessingEvents(): Promise<void>;
  requeueFailedEvents(): Promise<void>;
}

export const KAFKA_HEADERS_OUTBOX: Record<string, string> = {
  [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
};
```

Conventions:

- `aggregateId` is the entity's UUID — also the Kafka partition key.
- `payload` is already validated against the contract Zod schema
  (the mapper calls `<EventName>V1.parse(...)` before the insert).
- `[KAFKA_HEADERS.SCHEMA_VERSION]: "1"` is mandatory.
- `[KAFKA_HEADERS.EVENT_TYPE]: <EventName>` is mandatory.
- `OutboxPublisherWorker` (in `src/workers/outbox-publisher.worker.ts`)
  drains the table. It uses `FOR UPDATE SKIP LOCKED` so multi-pod is
  safe.

## Step 6 — Cross-aggregate reads inside transactions

A service may read **other** aggregates inside the same transaction —
for example, checking future schedules before changing operating
days. The pattern uses `tx.<model>` directly on the transaction
client:

```ts
return await this.prisma.$transaction(async (tx) => {
  const futureSchedules = await tx.schedule.findMany({
    where: { operatingDay: { in: dayIds }, departureAt: { gte: new Date() } },
  });
  if (futureSchedules.length > 0) {
    throw new ApiError(
      statusCode.conflict,
      ERROR_CODES.OPERATING_DAYS_REFERENCED,
    );
  }

  await this.operatingDayRepository.deleteMany(dayIds, tx);
  await this.outboxRepository.insert(tx, {/* ... */});
});
```

This is the **only** exception to "services never call Prisma
directly" — and only `tx.<model>` (a transaction client), never
`prisma.<model>` (the global client). The read must be inside the
transaction to share the snapshot.

## Step 7 — Wire the repository in the container

`src/container/<service>.container.ts`:

```ts
constructor() {
  this.prisma = prisma;
  this.trainRepository = new TrainRepository(prisma);
  this.outboxRepository = new OutboxRepository(prisma);
  this.trainService = new TrainService(this.prisma, this.trainRepository, this.outboxRepository);
  this.trainController = new TrainController(this.trainService);
}
```

Public fields only on what consumers use. The container field list
ends up being the "edge surface" of the service: controllers for
routes, `outboxRepository` for the outbox worker, the gRPC handler
(if exposed), and any cross-cutting repo a worker / consumer needs
directly.

## Step 8 — Verify

- `pnpm --filter <service> check-types` — must be clean. The
  `Prisma.<Entity>CreateInput` / `UpdateInput` types compile against
  `schema.prisma`.
- `pnpm --filter <service> lint` — must be clean.
- `pnpm --filter <service> prisma generate` — regenerate the client
  after any `schema.prisma` change.
- `pnpm --filter <service> dev` — confirm the new repository is
  reachable.

## Conventions every repository must satisfy

1. **One file per aggregate**, named `<entity>.repo.ts` (kebab-case
   file, PascalCase class).
2. **Constructor takes `PrismaClient`.** Tests pass a mock or a
   transactional client.
3. **Every writeable method's last parameter is `tx?: Prisma.TransactionClient`.**
4. **No business logic** — repositories don't validate, don't throw
   `ApiError`, don't translate errors.
5. **Method names are domain verbs**, not Prisma verbs.
6. **`isActive: true`** in every default `where` clause.
7. **Soft delete only** — never `prisma.<entity>.delete()` in the
   service layer.
8. **`readonly` on the constructor `prisma` field**.

## Common mistakes

### "I forgot to pass `tx` to a nested repository call."

The transaction silently commits without that write. The state
becomes inconsistent with the outbox row, and the next consumer
sees the event for a state that doesn't exist.

Audit:

```bash
grep -n "this\." apps/<svc>/src/services/<entity>.service.ts
```

Every `this.<repo>Repository.<method>(...)` inside a `$transaction`
callback must have a final `tx` argument.

### "I called `prisma.<model>.delete()` to remove a record."

Soft delete only. The convention is `isActive: false`. Real deletes
break Kafka events (consumers can't tell a deleted entity from one
that never existed).

### "My service catches `error instanceof Prisma.PrismaClientKnownRequestError` and rethrows as `ApiError`."

Right place for the catch. Wrong layer — repositories do this. Move
the catch to the service.

### "The transaction holds for 30 seconds."

A `await` on Kafka, gRPC, Redis, or external HTTP inside
`$transaction` keeps the lock open during the network call. The
outbox worker pattern exists to avoid this — write the event into
`outboxEvent` inside the transaction, let the worker publish after
commit.

### "Two pods both think they're the worker."

`OutboxPublisherWorker` uses `FOR UPDATE SKIP LOCKED` to claim
events. Multiple pods can be safe — the SQL claim is the lock. If a
worker grabs an event but doesn't ack in time, the recovery sweep
resets `PROCESSING` rows whose lease expired.

## Out of scope

- Migrations (`prisma migrate dev --name <change>`) — separate
  workflow, called out by `pnpm` scripts. This skill covers the
  repository that migrations feed, not migrations themselves.
- Generated client setup (`packages/contracts/proto/...` analogue
  for Prisma) — see `@generated/prisma/client.js` import paths in
  `rules/typescript.md`.
- Direct `prisma.<model>` calls from controllers — forbidden by
  `rules/architecture.md`. The cross-aggregate-read exception in
  Step 6 is the only escape hatch, and it lives in services, not
  controllers.

## Supporting files

- `transactions.md` — the four transaction patterns in detail
  (state-change + outbox, cross-aggregate read, conditional insert,
  cascade update). Read before threading a complex flow through
  multiple repositories.
