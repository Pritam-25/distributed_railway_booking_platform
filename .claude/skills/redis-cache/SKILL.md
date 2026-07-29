---
description: Add a Redis cache, distributed lock, or bounded health probe to a service. Covers key shape, TTL, SET NX EX locking pattern, PII guardrails, and bounded readiness check. Triggers on changes to apps/<svc>/src/config/redis.ts, adding a new cached query, or wiring a distributed lock around a critical section.
when_to_use: "Adding a Redis-backed cache for a read-heavy query, wiring a SET NX EX lock to serialize a critical section, or fixing a /health/ready probe that's hanging on Redis calls."
---

# redis-cache

Every service that uses Redis follows the same bootstrap, the same
key shapes, the same PII guardrails, and the same bounded health
probe. This skill is the creation workflow for caches and locks.

Idempotency keys for Kafka consumers live in `@irctc/redis` already
and are owned by the `kafka-consumer` skill — touch those separately.

## When to use Redis

Three legitimate use cases. If a use doesn't fit one of these, it
probably doesn't belong in Redis.

| Use case                                            | Example                                          | Skill section                                                      |
| --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Cache a read-heavy query result                     | search-service caches "trains from A to B"       | Cache patterns                                                     |
| Distributed lock around a critical section          | hold seats (booking), allocate seats (inventory) | Lock patterns                                                      |
| Cross-process idempotency for external side effects | notification dispatch (email), payment capture   | Owned by `kafka-consumer` / `@irctc/redis` `IdempotencyRepository` |

Redis is **not** a primary store. The source of truth is always
PostgreSQL. A Redis miss must always fall back to the database, and
a stale Redis value must be detectable (TTL plus invalidation on
write).

## When this skill runs

Trigger on any of:

- "Add a cache for `<query>`"
- "Wrap a critical section with a distributed lock"
- "Add a Redis health probe"
- Changes to `apps/<svc>/src/config/redis.ts`, the cache key naming
  in a service, or the `/health/ready` handler.

Do **not** trigger for:

- Idempotency keys for Kafka consumers — `kafka-consumer` skill and
  `@irctc/redis`.
- JSDoc on Redis cache code — `jsdoc` skill.
- Generic TypeScript or path-alias conventions — `rules/typescript.md`.

## Source of truth — `@irctc/redis`

| Export                                          | Use case                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `createRedisClient(url, overrideOptions?)`      | The single Redis client factory. Built-in `retryStrategy`, observability hooks, `lazyConnect: false`. |
| `IdempotencyRepository`                         | Two-phase `reserveIfNew` / `markProcessed` / `release`. Used by the `kafka-consumer` skill.           |
| `IDEMPOTENCY_STATE` (`PROCESSING`, `PROCESSED`) | State machine for the idempotency repository.                                                         |

When adding a new Redis helper, **first check whether `@irctc/redis`
already provides it**. The OpenTelemetry workaround in
`packages/redis/src/client.ts` (the `createRequire` ESM hook) is not
something to reproduce in a service — use the factory.

## Step 1 — Initialize Redis in `server.ts`

Pattern mirrors `apps/notification-service/src/config/redis.ts`:

```ts
import { createRedisClient } from "@irctc/redis";

export const redis = createRedisClient(env.REDIS_URL);

export const initRedis = async (): Promise<void> => {
  if (redis.status === "ready" || redis.status === "connecting") return;
  await new Promise<void>((resolve, reject) => {
    redis.once("ready", () => resolve());
    redis.once("error", reject);
  });
};

export const disconnectRedis = async (): Promise<void> => {
  await redis.quit();
};
```

In `server.ts`:

```ts
registerErrorMessages(ERROR_MESSAGES);
await prisma.$connect();
await withTimeout("Redis init", initRedis()); // ← between Prisma and Kafka
await withTimeout("Kafka init", initKafka());
// ...
```

Shutdown order:

```ts
await withTimeout("Consumer stop", container.<consumer>.stop());
await withTimeout("Kafka disconnect", disconnectKafka());
await withTimeout("Redis disconnect", disconnectRedis());  // ← after Kafka, before Prisma
await withTimeout("Prisma disconnect", prisma.$disconnect());
```

## Step 2 — Cache patterns

### Key shape

```
cache:<aggregate>:<stable-query-hash>
```

- `cache:` is the only allowed prefix — keeps Redis inspection clean.
- `<aggregate>` is the resource (`train`, `station`, `schedule`).
- `<stable-query-hash>` is the SHA-1 (or SHA-256) of the query
  parameters, **normalised** before hashing. Normalise by sorting
  keys and stripping whitespace.

```ts
import crypto from "node:crypto";

const hashQuery = (params: Record<string, unknown>): string =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest("hex");
```

The hash must be deterministic — same input produces same hash,
otherwise the cache miss rate stays at 100%.

### TTL

TTL on every key. Don't rely on a separate cleanup; Redis eviction
policies are not guarantees.

| Cache content                 | Typical TTL                       | Notes                                                                      |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| Search results                | 60s – 5 min                       | Bounded — the worst case is a 5-min stale search, recoverable on next read |
| Configuration / lookup tables | 5 min – 1 hour                    | Use the `del` invalidation on write side                                   |
| Auth tokens / sessions        | handled by `@irctc/redis` / Kafka | Not cache patterns                                                         |
| Projections of Kafka events   | 1 min – 1 hour                    | Bigger TTL on cold paths, smaller on hot paths                             |

### Cache read pattern (read-through with DB fallback)

```ts
async findTrainsByQuery(query: TrainSearchQuery): Promise<Train[]> {
  const cacheKey = `cache:train:${hashQuery(query)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as Train[];

  const trains = await this.trainRepository.list(query);
  await redis.set(cacheKey, JSON.stringify(trains), "EX", 60);
  return trains;
}
```

### Cache invalidation on write

Every cache write site needs an invalidation site:

```ts
async updateTrain(id: string, data: Prisma.TrainUpdateInput): Promise<Train> {
  const train = await this.prisma.$transaction(async (tx) => {
    const updated = await this.trainRepository.update(id, data, tx);
    await this.outboxRepository.insert(tx, { /* TRAIN_UPDATED event */ });
    return updated;
  });

  // Invalidate every cache key that could match this row. For a row
  // whose list shape changed, the safe move is to pattern-delete.
  await redis.del(`cache:train:${hashQuery({ id })}`);
  // For list caches keyed by non-id parameters, the consumer-driven
  // invalidation strategy is preferable (see the consumer pattern
  // below) — direct invalidation can't enumerate all matching keys.

  return train;
}
```

Pattern deletion (`KEYS` / `SCAN`) is expensive in production
Redis. Prefer one of:

1. **Invalidate by stable key** when the cache key derives from the
   row's identity (`id`).
2. **Invalidate via a consumer** when the cache is keyed by query
   parameters that the writer doesn't know about. The consumer of
   the `TRAIN_UPDATED` event holds a SCAN / bounded invalidation
   job — see the `kafka-consumer` skill.
3. **Bounded TTL** when staleness is acceptable. This is the
   default — the worst case is one TTL window of stale results.

### PII guardrails

Never cache responses that contain PII:

- `email`, `phone`, `address`, `dateOfBirth`
- `firstName`, `lastName`, `fullName`
- Auth tokens, session IDs, OTPs

The `@irctc/logger` `REDACT_PATHS` covers log output, not Redis
payloads. If a query might return PII, **don't cache the response**;
cache only the PII-free projection.

A search result keyed by train number → train entities is fine
(no PII). A search result keyed by user email → user profile is not
fine — query by `userId` instead, and never key by email.

## Step 3 — Lock pattern (SET NX EX)

Use Redis `SET NX EX` for short-lived locks during critical
sections. The canonical case is "hold these seats" in booking —
multiple pods may try to hold the same seats concurrently, and the
lock serializes them.

```ts
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { redis } from "@config";

async holdSeats(scheduleId: string, seatIds: string[]): Promise<Hold> {
  const lockKey = `lock:schedule:${scheduleId}`;
  const acquired = await redis.set(lockKey, env.SERVICE_POD_ID, "EX", 5, "NX");
  if (!acquired) {
    throw new ApiError(statusCode.conflict, ERROR_CODES.SEATS_ALREADY_HELD);
  }

  try {
    return await this.doHoldSeats(scheduleId, seatIds);
  } finally {
    await redis.del(lockKey);
  }
}
```

Properties:

- **TTL must be longer than the worst-case business flow** but short
  enough that a crashed holder doesn't block forever. 5s is a
  reasonable default for seat holds; raise for known-slow flows
  (e.g. 15s for a multi-step database migration).
- **`SET NX EX` is atomic.** The `NX` (only-if-not-exists) check
  and the `EX` (expiry) set happen in one round trip — no separate
  `SETNX` + `EXPIRE` pair.
- **`del` in `finally`.** Even on success, even on validation error.
  A leaked lock holds until the TTL expires.
- **Pass the pod ID as the value.** Lets a recovery sweep identify
  stale locks. Use a Lua script for `compare-and-delete` if you
  need to verify ownership under contention:

  ```lua
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
  ```

### When to use a lock vs the database

- **DB-only concurrency control** is usually enough when the
  critical section is a single SQL operation. Prisma's transaction
  isolation gives you the equivalent of a lock for the duration.
- **Redis lock** is necessary when the critical section spans
  multiple operations (hold seats → deduct inventory → emit event),
  or when you need a TTL so a crashed holder's lock can expire.

If you find yourself writing locks on top of every Prisma transaction,
reconsider — you're trading atomic operations for distributed lock
overhead with no concurrency benefit.

## Step 4 — Bounded health probe

`/health/ready` must include a Redis check, wrapped in `Promise.race`
against a 5s `setTimeout`:

```ts
async checkRedis(): Promise<ReadinessCheck> {
  const start = Date.now();
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("redis probe timeout")), 5000)),
    ]);
    return { name: "redis", ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "redis", ok: false, latencyMs: Date.now() - start, error: String(error) };
  }
}
```

The default ioredis timeout is 30s+; without a bounded race a slow
Redis hangs the readiness response and k8s can't mark the pod
NotReady in time. See `rules/bootstrap.md` for the full health-endpoint
spec.

Never throw from a readiness check. Return `{ ok: false, error }` and
let the handler decide the HTTP status.

## Conventions every Redis-using service must satisfy

1. **One `Redis` client per service**, created via `createRedisClient`.
   Don't construct a raw `new Redis(...)` in service code.
2. **All cache keys prefixed `cache:`**, all lock keys prefixed `lock:`.
   Other prefixes (`idempotency:`, `session:`) are owned by other
   packages — don't invent more.
3. **TTL on every key.** No eternal keys unless explicitly justified
   in a comment (rare).
4. **No PII in cached values.** Project to a PII-free shape before
   caching, or don't cache.
5. **`/health/ready` includes Redis** when the service uses Redis.
   Wrap in 5s `Promise.race`.
6. **Disconnect Redis** in the shutdown sequence after Kafka, before
   Prisma.
7. **`del` in `finally`** for every `SET NX EX` lock. Use a Lua
   compare-and-delete for ownership verification.

## Common mistakes

### "Cache miss rate stays at 100%."

The key isn't deterministic. Hashing different orderings of the same
parameters produces different keys. Always sort keys before
`JSON.stringify`.

### "Redis eats CPU during `KEYS pattern:*`."

`KEYS` is O(N) and blocks the Redis main thread. Use `SCAN` with a
cursor, or maintain an inverse index (`<aggregate>:tags:<tag>` set of
cache keys) updated on write.

### "Lock holder crashed and the lock is held forever."

The TTL didn't expire. Confirm the `EX` value matches the expected
worst-case business flow duration. Add a recovery sweep job that
removes locks whose `value` matches a known-dead pod ID.

### "Cache returns stale data after a write."

The invalidation on write is missing, or the invalidation key
doesn't match the cache key. Audit the cache key derivation and the
invalidation set together — they're two halves of the same contract.

### "Read-through cache hits the DB anyway."

The cache miss path is buggy. Wrap the DB call in a `Promise.all`
race against an in-flight `SET NX EX` (single-flight), or use
`SET NX EX` to acquire a per-key "computing" lock so only one pod
populates the cache.

## Out of scope

- Idempotency for Kafka consumers — `kafka-consumer` skill and
  `@irctc/redis`'s `IdempotencyRepository`. The shape is documented
  in `@irctc/redis` itself.
- Auth tokens and sessions — handled by `@irctc/auth-headers` (not
  yet built out in this repo).
- Redis pub/sub for service-to-service notifications — not used
  in this codebase.

## Supporting files

- `patterns.md` — concrete patterns for each cache and lock
  case, with before/after examples. Read when designing a new
  cache or lock usage.
