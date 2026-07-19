# @irctc/contracts

The centralized schema and contract definition package for the IRCTC-style distributed railway booking platform. It contains Zod validation schemas, TypeScript interfaces, and constant values (topics, consumer groups) to align service communication across the monorepo.

## Features

- **Standardized Event Schemas:** Versioned event schemas defined using Zod (e.g. `v1`) that represent the exact payload wire formats on the message bus.
- **Common Topic Registry (`KAFKA_TOPICS`):** Immutable dictionary containing the canonical Kafka topic names for all domains (user, train, schedule, station, route, coach).
- **Consumer Group Registry (`CONSUMER_GROUPS`):** Predefined strings for consumer group subscription names.
- **Strong Typing:** Provides generated TypeScript types from runtime Zod schemas for absolute compile-time type-safety.

---

## Directory Structure

```text
packages/contracts/
├── src/
│   ├── admin/  # Event schemas for administration domain (trains, routes, schedules)
│   ├── kafka/  # Constants for topic names, consumer groups, and event type metadata
│   ├── user/   # Event schemas for user registration, OTP, and login events
│   └── index.ts
```

---

## Usage

### 1. Referencing Kafka Topics & Groups

Import canonical strings to setup producers or subscribe consumers:

```typescript
import { KAFKA_TOPICS, CONSUMER_GROUPS } from "@irctc/contracts";

console.log(KAFKA_TOPICS.USER_OTP_REQUESTED); // "user.otp-requested.v1"
console.log(CONSUMER_GROUPS.NOTIFICATION_OTP); // "notification-service-otp-consumer"
```

### 2. Validating Received Payloads (Consumer Side)

Safely parse incoming payloads on the message consumer:

```typescript
import { OTPRequestedV1, type OTPRequestedV1Type } from "@irctc/contracts";

const handleMessage = (rawPayload: string) => {
  const parsed = JSON.parse(rawPayload);

  // Zod validation validates the payload structure and parses types
  const result = OTPRequestedV1.safeParse(parsed);

  if (!result.success) {
    // Route validation failures to the Dead Letter Queue (DLQ)
    throw new Error("Payload validation failed");
  }

  const event: OTPRequestedV1Type = result.data;
  console.log(`OTP generated for ${event.email}: ${event.otp}`);
};
```

### 3. Emitting Standardized Payloads (Publisher Side)

Ensure outbox event payloads conform to schemas prior to insertion:

```typescript
import { TrainCreatedV1, type TrainCreatedV1Type } from "@irctc/contracts";

const payload: TrainCreatedV1Type = {
  eventId: "uuid-v4",
  trainId: "uuid-v4",
  trainNumber: "12626",
  name: "Kerala Express",
  createdAt: new Date(),
};

// Validate before writing to outbox table
TrainCreatedV1.parse(payload);
```
