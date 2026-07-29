# Patterns — concrete cache and lock examples

Each pattern is a before/after for a real case in this codebase. Use
these as templates when introducing new Redis usage.

## Pattern 1 — Search result cache (read-heavy)

`search-service` has the canonical case: a "trains from A to B"
endpoint that's hit thousands of times per minute, but the underlying
data only changes every few minutes.

### Key

```
cache:train-search:<sha1(origin+destination+date)>
```

```ts
import crypto from "node:crypto";
import { redis } from "@config";

const hashSearch = (params: { from: string; to: string; date: string }) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest("hex");
```

### Service

```ts
async searchTrains(query: TrainSearchQuery): Promise<Train[]> {
  const cacheKey = `cache:train-search:${hashSearch(query)}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.info({ module: "search-service", cacheKey }, "search cache hit");
    return JSON.parse(cached) as Train[];
  }

  const trains = await this.trainRepository.searchAvailableTrains(query);
  await redis.set(cacheKey, JSON.stringify(trains), "EX", 300); // 5 min

  return trains;
}
```

### Invalidation

Search results are read-heavy, write-rare (admin only updates train
data). Three layers of invalidation:

1. **TTL** (5 min) — caps the staleness window even if explicit
   invalidation misses.
2. **Write-side invalidation** — `train.update()`, `train.create()`,
   `train.deactivate()` in admin-service each call
   `redis.del(cacheKey)` for any key the data affects. For list
   caches, this is approximated: clear the most-recently-accessed
   keys via a SCAN job.
3. **Consumer-driven invalidation** — the search-service consumer of
   `TRAIN_UPDATED` / `TRAIN_CREATED` events runs a bounded SCAN that
   deletes `cache:train-search:*` entries containing the affected
   train's route ID. This is the most reliable layer; the others
   fall back to TTL.

## Pattern 2 — Seat hold lock

`booking-service` acquires a per-schedule lock during seat-hold to
serialize concurrent hold attempts.

### Key

```
lock:schedule:<scheduleId>
```

Value: the pod's ID (`env.SERVICE_POD_ID`), so a recovery sweep can
identify dead holders.

### Service

```ts
import { redis } from "@config";
import { ApiError, ERROR_CODES, statusCode } from "@irctc/errors";
import { withTimeout } from "@utils/with-timeout";

async holdSeats(dto: HoldSeatsRequestDto): Promise<Hold> {
  const lockKey = `lock:schedule:${dto.scheduleId}`;
  const acquired = await redis.set(lockKey, env.SERVICE_POD_ID, "EX", 5, "NX");
  if (!acquired) {
    throw new ApiError(statusCode.conflict, ERROR_CODES.SEATS_ALREADY_HELD);
  }

  try {
    return await this.doHoldSeats(dto);
  } finally {
    // compare-and-delete via Lua so we don't release a lock another
    // pod now owns (TTL expired and they acquired it mid-flight).
    await redis.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
      1,
      lockKey,
      env.SERVICE_POD_ID,
    );
  }
}
```

The compare-and-delete is what makes the lock recovery-safe. Without
it, a slow flow that hits the TTL boundary can release a lock
another pod now owns.

### Lock value

Pick something unique and meaningful:

```ts
// In src/config/env.ts
SERVICE_POD_ID: z.string().default(`booking-${crypto.randomUUID()}`),
```

`crypto.randomUUID()` per process is fine; the value only needs to be
unique among pods that could be holding this lock.

## Pattern 3 — Distributed session cache

For authenticated user sessions (the eventual shape, not yet built
in this repo):

### Key

```
session:<sessionId>
```

Value: the session payload (user ID, roles, expiry). **Never** include
the auth token itself — derive from a server-side store, not from the
Redis value.

### Service

```ts
async getSession(sessionId: string): Promise<Session | null> {
  const cached = await redis.get(`session:${sessionId}`);
  if (!cached) return null;
  return JSON.parse(cached) as Session;
}

async putSession(sessionId: string, session: Session): Promise<void> {
  await redis.set(
    `session:${sessionId}`,
    JSON.stringify(session),
    "EX",
    60 * 60 * 24 * 7, // 7 days
  );
}

async revokeSession(sessionId: string): Promise<void> {
  await redis.del(`session:${sessionId}`);
}
```

Log out → `revokeSession`. Idle timeout → handled by TTL on the key.
Refresh → re-`SET` with the same `EX` window.

## Pattern 4 — Cache invalidation via consumer

`search-service` (or whichever service owns the cache) subscribes to
the producer's update events. On every relevant event, it runs a
bounded invalidation job.

```ts
async handle(event: TrainUpdatedV1Type): Promise<void> {
  await this.idempotencyRepository.executeInTransaction(async (tx) => {
    // Update the projection
    await this.trainProjectionRepository.update(event, tx);

    // Invalidate caches that match this train
    // We don't know the exact query keys, so SCAN with a bounded
    // count to find train-search keys containing this train's id.
    await this.invalidateTrainCaches(event.trainId);
  });

  async invalidateTrainCaches(trainId: string): Promise<void> {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "cache:train-search:*", "COUNT", 100);
      cursor = next;
      // Each cached value is JSON; we don't want to fetch and parse
      // every one. For a coarse invalidation, drop a sample and
      // trust TTL.
      for (const key of keys) {
        // Coarse-grained: drop every key. Acceptable for a 5-min
        // TTL; expensive at scale. For finer control, store an
        // inverse index per route.
        await redis.del(key);
      }
    } while (cursor !== "0");
  }
}
```

Coarse invalidation: drop everything in the namespace. Cheap at
small scale; expensive at high cache volume. For high-volume
services, maintain an inverse index (`route:<routeId>:cache-keys`
set) updated on write.

## Pattern 5 — Single-flight cache populate

When a high-traffic miss would all hit the DB in parallel:

```ts
async findTrainsByQuery(query: TrainSearchQuery): Promise<Train[]> {
  const cacheKey = `cache:train-search:${hashSearch(query)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as Train[];

  // Single-flight via SET NX EX with a short TTL. Whoever wins
  // populates; everyone else re-reads after a small wait.
  const populateKey = `${cacheKey}:populate`;
  const gotIt = await redis.set(populateKey, env.SERVICE_POD_ID, "EX", 10, "NX");
  if (!gotIt) {
    // Another pod is populating; brief wait then re-read.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const retry = await redis.get(cacheKey);
    if (retry) return JSON.parse(retry) as Train[];
  }

  try {
    const trains = await this.trainRepository.searchAvailableTrains(query);
    await redis.set(cacheKey, JSON.stringify(trains), "EX", 300);
    return trains;
  } finally {
    await redis.del(populateKey);
  }
}
```

Use single-flight only when the database load is the bottleneck. For
most services, the 5-min TTL is sufficient and the simpler
read-through-with-fallback pattern is enough.

## Pattern 6 — Bounded health probe

Add to `apps/<svc>/src/services/health.service.ts` (or inline in the
controller — most services inline):

```ts
async checkRedis(): Promise<ReadinessCheck> {
  const start = Date.now();
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("redis probe timeout")), 5000),
      ),
    ]);
    return { name: "redis", ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "redis", ok: false, latencyMs: Date.now() - start, error: String(error) };
  }
}
```

Wire it into the readiness handler alongside Prisma and Kafka
checks. See `rules/bootstrap.md` for the full handler shape.
