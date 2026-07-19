# @irctc/redis

Centralized Redis client initialization and idempotency tracking repository for the IRCTC-style distributed railway booking platform.

## Features

- **Centralized Client Creation:** Scopes connection logic, retry backoff algorithms, and observability hooks in a single constructor.
- **OpenTelemetry ESM Workaround:** Bypasses ESM static load hooks by resolving `ioredis` dynamically at runtime using `createRequire`, enabling auto-instrumentation compatibility with `@opentelemetry/instrumentation-ioredis`.
- **Atomic Lua-backed Idempotency Lock:** Implements a Lua-scripted `IdempotencyRepository` to ensure exactly-once processing of Kafka event payloads under concurrent consumer workers.

## Directory Structure

```text
packages/redis/
├── src/
│   ├── client.ts                  # Centralized Redis connection creator
│   ├── idempotency.repository.ts  # Redis-backed idempotency helper
│   └── index.ts                   # Main entry point exports
```

## Usage

### 1. Initializing the Redis Client

```typescript
import { createRedisClient } from "@irctc/redis";
import { env } from "./config.js";

const redis = createRedisClient(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});
```

### 2. Safeguarding Message Processing (Exactly-Once Semantics)

Utilize the `IdempotencyRepository` in consumers to guarantee that duplicate redeliveries do not trigger side effects twice:

```typescript
import { IdempotencyRepository } from "@irctc/redis";
import { redisClient } from "@config";

// Setup repository with lease (in-flight lock) and processed retention
const idempotencyRepo = new IdempotencyRepository(
  redisClient,
  30, // Lock lease time: 30 seconds
  86400, // Final PROCESSED retention log: 24 hours
  "booking-service-otp-idempotency", // isolated keyspace namespace
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
