# @irctc/redis

Centralized Redis client initialization, dedicated Pub/Sub subscriber client creation, readiness health checking, and idempotency tracking repository for the IRCTC-style distributed railway booking platform.

## Features

- **Centralized Client Creation:** Scopes connection logic, exponential retry backoff, and direct `@irctc/logger` event hooks in simple constructor helpers.
- **Dedicated Pub/Sub Subscriber Client:** Provides `createSubscriberClient` pre-configured with `maxRetriesPerRequest: null`, `enableReadyCheck: false`, and `autoResubscribe: true` required by `ioredis` for subscriber connections.
- **Readiness Health Checking:** `checkRedisHealth` executes readiness PING probes with bounded timeouts.
- **Atomic Lua-backed Idempotency Lock:** Implements a Lua-scripted `IdempotencyRepository` to ensure exactly-once processing of Kafka event payloads under concurrent consumer workers.
- **Centralized Types:** Re-exports Redis client interfaces, options, and health results from `src/types.ts`.

## Directory Structure

```text
packages/redis/
├── src/
│   ├── client.ts                  # Command and Subscriber connection creators
│   ├── health.ts                  # Redis readiness PING probe check
│   ├── idempotency.repository.ts  # Lua-backed idempotency repository
│   ├── types.ts                   # Centralized Redis types & health result signatures
│   └── index.ts                   # Main entry point exports
```

## Usage

### 1. Initializing Redis Command & Subscriber Clients

```typescript
import {
  createRedisClient,
  createSubscriberClient,
  initRedis,
  disconnectRedis,
} from "@irctc/redis";
import { env } from "@config";

// Command client (GET, SET, PING, PUBLISH)
const redis = createRedisClient(env.REDIS_URL);

// Subscriber client (SUBSCRIBE)
const redisSubscriber = createSubscriberClient(env.REDIS_URL);

// Bootstrap connection check
await initRedis(redis);

// Graceful cleanup
await disconnectRedis(redis);
```

### 2. Readiness Health Checking

```typescript
import { checkRedisHealth } from "@irctc/redis";

const health = await checkRedisHealth(redis);
// { name: "redis", ok: true, latencyMs: 3 }
```

### 3. Safeguarding Message Processing (Exactly-Once Semantics)

```typescript
import { IdempotencyRepository } from "@irctc/redis";
import { redis } from "@config";

// Setup repository with lease (in-flight lock) and processed retention
const idempotencyRepo = new IdempotencyRepository(
  redis,
  30, // Lock lease time: 30 seconds
  86400, // Final PROCESSED retention log: 24 hours
  "notification-service-otp-idempotency", // isolated keyspace namespace
);

const handleEvent = async (
  eventId: string,
  processPayload: () => Promise<void>,
) => {
  // 1. Try to claim/lock the event
  const isNew = await idempotencyRepo.reserveIfNew(eventId);

  if (!isNew) {
    console.log(
      `Event ${eventId} has already been claimed or processed. Skipping.`,
    );
    return;
  }

  try {
    // 2. Process payload business logic
    await processPayload();

    // 3. Mark as successfully processed (lock becomes permanent PROCESSED log)
    await idempotencyRepo.markProcessed(eventId);
  } catch (error) {
    // 4. On failure, release lock so the message is eligible for immediate retry
    await idempotencyRepo.release(eventId);
    throw error;
  }
};
```
