---
description: Scaffold a Kafka consumer in an existing service, with DLQ routing and idempotency. Covers event contract discovery, idempotency strategy choice (Prisma vs Redis), consumer class shape, container wiring, and server.ts startup/shutdown ordering. Triggers on adding src/consumers/<event>.consumer.ts, wiring a new KafkaConsumerRunner, or troubleshooting DLQ routing / duplicate processing.
when_to_use: "Adding a new Kafka consumer to a service, writing the consumer class, choosing between Prisma and Redis idempotency, wiring the consumer in the container, or adding the consumer to server.ts startup and shutdown."
---

# kafka-consumer

Every Kafka consumer in this platform follows the same shape:
contracts-first (`@irctc/contracts`), `safeParse` for validation,
`wrapWithDlq` for failure routing, idempotency before side effects,
container DI, lifecycle bound by `server.ts`.

This skill covers the consumer creation flow. Layer invariants (the
outbox, the `eventId`, message keys, REDACT_PATHS) live in
`rules/kafka.md`-style notes — but those are pulled in by the
existing `rules/` layer; this skill is the creation workflow.

## The pipeline this skill protects

```
              packages/contracts/src/<bounded-context>/
              <bounded-context>-events.v1.ts
                            │
                            │ re-export through package barrel
                            ▼
              apps/<consumer-svc>/src/consumers/
              ├── <event-name>.consumer.ts
              └── index.ts
                            │
                            │ wrapped with wrapWithDlq
                            │ + idempotency (Prisma or Redis)
                            ▼
              apps/<consumer-svc>/src/services/
              └── <handling>.service.ts
                            │
                            │ container DI + server.ts lifecycle
                            ▼
              KafkaConsumerRunner.run(<topic>, wrapped-handler)
```

Four rules govern everything below:

1. **Contracts first.** Event schemas live in `@irctc/contracts`. The
   consumer never hand-writes the message shape.
2. **Validate at the boundary.** `safeParse` + `PROCESSING_STATUS.INVALID`
   for schema failures (commits the offset, logs and skips). Reserve
   `throw` for transient failures (kafkajs will retry, then DLQ).
3. **Idempotency before side effects.** External side effects (email,
   payment, third-party) use the two-phase Redis pattern via
   `@irctc/redis`. DB side effects (projection updates) use a
   Prisma `IdempotencyRepository`.
4. **Lifecycle is bound by `server.ts`.** `start()` runs after
   `app.listen`; `stop()` runs before Kafka disconnect in the
   shutdown sequence.

## When this skill runs

Trigger on any of:

- "Add a Kafka consumer for <topic>"
- "Scaffold a consumer in <service>"
- "Write the handling service for <EventName>V1"
- Changes under `apps/<svc>/src/consumers/`, `apps/<svc>/src/services/`
  that handle Kafka events.

Do **not** trigger for:

- REST API design — `openapi` skill.
- gRPC handlers — `grpc-service` skill.
- Producer-side outbox writes — covered by `rules/architecture.md`
  ("Cross-service events") and `prisma-repository` skill.
- JSDoc on the consumer class itself — `jsdoc` skill.

## Source of truth — `@irctc/kafka` and `@irctc/redis`

| Export                                                    | Use case                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `KafkaConsumerRunner`                                     | The subscription loop. Shared across consumers in a service.       |
| `wrapWithDlq(producer, options, logger, handler)`         | Wraps the handler so throw → DLQ. **Always** used.                 |
| `KAFKA_HEADERS`                                           | Standard header keys (`SCHEMA_VERSION`, `EVENT_TYPE`, `EVENT_ID`). |
| `DLQ_REASONS`                                             | Standard DLQ reason values.                                        |
| `PROCESSING_STATUS` (`INVALID`, `DUPLICATE`, `PROCESSED`) | Return value of the handling service's `process()`.                |
| `IdempotencyRepository` (from `@irctc/redis`)             | Two-phase `reserveIfNew` / `markProcessed` / `release`.            |

When adding a new consumer helper, **first check whether `@irctc/kafka`
or `@irctc/redis` already provides it**. Adding a parallel
implementation breaks the single-source-of-truth guarantee.

## Step 1 — Verify the contract exists

In `packages/contracts/src/<bounded-context>/<bounded-context>-events.v1.ts`,
the Zod schema for the event you consume must exist. If it does not:

1. Add `<EventName>V1` to the relevant file. Always include
   `eventId: z.uuid()` and `createdAt: z.coerce.date()`.
2. Add the topic name and DLQ topic to
   `packages/contracts/src/kafka/topics.ts`.
3. Add the event type to `packages/contracts/src/kafka/event-types.ts`.
4. Add the consumer group to
   `packages/contracts/src/kafka/consumer-groups.ts`.
5. Run `pnpm --filter @irctc/contracts build`.

For an inventory event being consumed by booking-service today, look
under `packages/contracts/src/inventory/` (this folder does not yet
exist — see the "Out of scope" section).

## Step 2 — Pick an idempotency strategy

The handling service's `process()` always parses → dedupes → runs the
business flow. The dedupe step depends on the side effect:

| Side effect                                | Idempotency                                                                                                                    | Where it lives                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| DB write (e.g. updating a projection)      | `IdempotencyRepository` (Prisma) — write the dedupe row inside the same transaction as the projection write                    | `apps/<svc>/src/repository/idempotency.repo.ts` |
| External (email, payment, third-party API) | `@irctc/redis`'s `IdempotencyRepository` — two-phase `reserveIfNew` → work → `markProcessed` on success / `release` on failure | imports from `@irctc/redis`                     |

For the inventory consumer in booking-service (likely projection
update), use the Prisma pattern. For the OTP / welcome consumers in
notification-service (external email send), use the Redis pattern.

## Step 3 — Build the consumer class

`src/consumers/<event-name>.consumer.ts` (kebab-case, `Event` in the
PascalCase class name). The canonical pattern in this codebase is in
`apps/notification-service/src/consumers/otp-notification.consumer.ts`:

```ts
import type { KafkaConsumerRunner, EachMessagePayload } from "@irctc/kafka";
import type { OtpNotificationService } from "@services";
import type { logger as irctcLogger } from "@irctc/logger";
import { KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Kafka consumer for the <TopicName> topic.
 *
 * Orchestrates <business capability> when a <EventName>V1 event is
 * emitted. Uses <idempotency strategy> to guarantee at-most-once side
 * effects. Failures are routed to <DLQ topic> via `wrapWithDlq`.
 */
export class <EventName>Consumer {
  constructor(
    private readonly runner: KafkaConsumerRunner,
    private readonly service: <HandlingService>,
    private readonly logger: typeof irctcLogger,
  ) {}

  /**
   * Boots the subscription loop on <KAFKA_TOPICS.X>.
   */
  async start(): Promise<void> {
    await this.runner.run(KAFKA_TOPICS.<EVENT_NAME>, (payload) =>
      this.handle(payload),
    );
  }

  /**
   * Stops the consumer subscription and disconnects from the broker.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }

  /**
   * Parses the raw payload, classifies failures, and delegates to the
   * handling service. Heartbeats after every message so the broker does
   * not rebalance mid-work.
   */
  private async handle(payload: EachMessagePayload): Promise<void> {
    const { message, heartbeat } = payload;

    if (message.value === null) return;

    try {
      const event = JSON.parse(message.value.toString("utf8"));
      await this.service.process(event);
    } catch (err) {
      const isParseError = err instanceof SyntaxError;

      if (isParseError) {
        this.logger.error(
          {
            module: "<event>-consumer",
            err: err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
            messageKey: message.key?.toString("utf8"),
          },
          "Failed to parse <EventName> payload (non-retryable). Committing offset and discarding.",
        );
      } else {
        this.logger.error(
          {
            module: "<event>-consumer",
            err: err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
            messageKey: message.key?.toString("utf8"),
          },
          "Transient error processing <EventName>. Rethrowing for retry.",
        );
        throw err;
      }
    } finally {
      await heartbeat();
    }
  }
}
```

Three decisions to be deliberate about:

- **`safeParse` vs `parse`.** The codebase's notification consumers
  use `safeParse` inside the handling service and return
  `PROCESSING_STATUS.INVALID` (the offset commits, the message is
  discarded). The `kafka.md` rule from `itctc-clone` prescribes
  `parse` + DLQ. **Pick one and be consistent within a service.**
  This codebase leans toward `safeParse` for forward-compatible
  contracts where the consumer can drop a malformed message; use
  `parse` + DLQ only when the business must react to every malformed
  message (rare).
- **Parse errors vs transient errors.** `SyntaxError` from
  `JSON.parse` is non-retryable — log and commit. Everything else
  is retryable — rethrow so `wrapWithDlq` can route it after
  retries exhaust.
- **Heartbeat in `finally`.** Always, even on the parse-error path,
  so a slow parse doesn't trigger a rebalance.

### Wrap with DLQ (alternative pattern)

If the service uses `parse` + throw for everything (the older
`itctc-clone` pattern), wrap the handler:

```ts
async start(): Promise<void> {
  const dlqHandler = wrapWithDlq(
    this.producer,
    { dlqTopic: KAFKA_TOPICS.<EVENT_NAME>_DLQ },
    this.logger,
    (payload) => this.handle(payload),
  );
  await this.runner.run(KAFKA_TOPICS.<EVENT_NAME>, dlqHandler);
}
```

Both shapes work — pick per the parse decision above. Mixing them in
the same service is a smell.

## Step 4 — Implement the handling service

`src/services/<handling>.service.ts`. For external side effects (the
notification-service pattern):

```ts
import { <EventName>V1, type <EventName>V1Type } from "@irctc/contracts";
import { PROCESSING_STATUS, type ProcessingStatus } from "@irctc/kafka";
import { IdempotencyRepository } from "@irctc/redis";
import { logger as irctcLogger } from "@irctc/logger";

export class <HandlingService> {
  private readonly logger: typeof irctcLogger;

  constructor(
    private readonly idempotency: IdempotencyRepository,
    private readonly <sideEffectClient>: <SideEffectClient>,
    logger: typeof irctcLogger,
  ) {
    this.logger = logger.child({ module: "<handling>-service" });
  }

  private validate(event: unknown): <EventName>V1Type | null {
    const result = <EventName>V1.safeParse(event);
    if (!result.success) {
      this.logger.warn(
        { issues: result.error.issues },
        "<EventName>V1 schema validation failed",
      );
      return null;
    }
    return result.data;
  }

  async process(event: unknown): Promise<ProcessingStatus> {
    const parsed = this.validate(event);
    if (!parsed) return PROCESSING_STATUS.INVALID;

    const reserved = await this.idempotency.reserveIfNew(parsed.eventId);
    if (!reserved) {
      this.logger.info({ eventId: parsed.eventId }, "Duplicate <EventName> skipped");
      return PROCESSING_STATUS.DUPLICATE;
    }

    try {
      await this.<sideEffectClient>.do(parsed);
    } catch (err) {
      await this.idempotency.release(parsed.eventId).catch((releaseErr) => {
        this.logger.warn(
          { eventId: parsed.eventId, error: releaseErr },
          "Failed to release idempotency reservation after side-effect failure",
        );
      });
      throw err;
    }

    await this.idempotency.markProcessed(parsed.eventId);
    this.logger.info(
      { eventId: parsed.eventId },
      "<EventName> processed successfully",
    );
    return PROCESSING_STATUS.PROCESSED;
  }
}
```

For DB side effects (projection update pattern), the
`IdempotencyRepository` is a Prisma repository inside the service's
`src/repository/` folder. The `process()` method runs the projection
write and the dedupe row insert inside the same
`prisma.$transaction`. See the `prisma-repository` skill for
transaction propagation.

## Step 5 — Wire the consumer in the container

`src/container/<service>.container.ts`:

1. Add the consumer to the imports from `@consumers`.
2. Add a public field `<eventName>Consumer: <EventName>Consumer`.
3. In the constructor, instantiate it with `this.runner`, the
   handling service, and the logger.

If the service doesn't already have a `KafkaConsumerRunner`, add one
in the container:

```ts
const runner = new KafkaConsumerRunner({
  kafka,
  groupId: env.<SERVICE>_CONSUMER_GROUP,
});
```

The runner and producer are typically shared across consumers in the
service.

Re-export the consumer from `src/consumers/index.ts`.

## Step 6 — Start and stop in `server.ts`

In `server.ts`, after `app.listen(...)` and `Container.getInstance()`:

```ts
const container = <Service>Container.getInstance();
await container.<eventName>Consumer.start();
```

In the shutdown sequence, **before** `disconnectKafka()`:

```ts
try {
  await withTimeout("Consumer stop", container.<eventName>Consumer.stop());
} catch (error) {
  logger.error(
    { module: "server", err: error },
    "Error stopping <eventName> consumer",
  );
}
```

The full shutdown order (HTTP → consumers → Kafka → gRPC → Prisma →
telemetry) is in `rules/bootstrap.md`.

## Step 7 — Verify

- `pnpm --filter <service> check-types` — must be clean.
- `pnpm --filter <service> lint` — must be clean.
- `pnpm --filter <service> dev` — confirm the consumer subscribes
  (log line from `KafkaConsumerRunner.run`).
- Publish a sample event to the source topic — confirm the handler
  runs, the side effect happens, and re-publishing the same event is
  a no-op (idempotency works).
- Publish a malformed message (or stop schema-validation deliberately)
  — confirm it ends up in the DLQ (or is logged and skipped if you
  use the `safeParse` pattern).

## Conventions every consumer must satisfy

1. **Event contracts come from `@irctc/contracts`.** No hand-written
   message shapes.
2. **Idempotency is non-optional** for any consumer with a side
   effect. Reading-only consumers can skip it (rare).
3. **`eventId` is the dedupe key.** Never PII.
4. **DLQ is mandatory for every consumer.** Either via
   `wrapWithDlq` (parse + throw pattern) or via the `safeParse` +
   `INVALID` return pattern.
5. **Heartbeat in `finally`** so the broker never rebalances mid-work.
6. **Consumer lifecycle is bound by `server.ts`.** `start()` after
   `app.listen`, `stop()` before Kafka disconnect.
7. **No PII in log payloads.** Log `eventId`, `topic`,
   `consumerGroup`, `latencyMs`. Never the payload itself.

## Common mistakes

### "The consumer runs but the DB update happens twice."

The idempotency check is using `markIfNew` (one-shot) instead of the
two-phase `reserveIfNew` → `markProcessed` / `release` pattern. The
one-shot pattern drops the event on a single transient failure
because redelivery is short-circuited as a duplicate — do not use it
for external side effects.

### "Heartbeat fires only on the happy path."

`heartbeat()` must be in `finally`, not in the `try` block. A slow
parse error can exceed the `max.poll.interval.ms` and trigger a
rebalance.

### "DLQ topic doesn't exist."

The DLQ topic must be created in `packages/contracts/src/kafka/topics.ts`
**and** declared in the broker. `allowAutoTopicCreation: false` is on
by default, so writing to a non-existent DLQ topic is a fatal error
(see `wrapWithDlq`'s "FATAL: Failed to write to DLQ" branch).

### "The consumer starts but doesn't see messages."

Consumer group mismatch. Check `env.<SERVICE>_CONSUMER_GROUP` matches
the group declared in `packages/contracts/src/kafka/consumer-groups.ts`.
A fresh consumer group on an existing topic starts at the latest
offset by default — rewind via `kafka-consumer-groups.sh --reset-offsets`
for backfill.

### "Logs show `eventId` is `undefined`."

The producer's mapper didn't mint `crypto.randomUUID()`. Every
`packages/contracts/src/<bounded-context>/<bounded-context>-events.v1.ts`
schema carries `eventId: z.uuid()` and every mapper
(`apps/<svc>/src/mappers/<entity>.mapper.ts`) must generate one.
Don't reuse the entity's `id`.

## Out of scope

- The transactional outbox publisher (producer side) — see
  `rules/architecture.md` ("Cross-service events"). The outbox worker
  is a worker, not a consumer; its lifecycle is in `rules/bootstrap.md`.
- gRPC consumers — this codebase doesn't run gRPC streaming.
- Schema-registry-style versioning of the message envelope — handled
  at the contract layer (`<EventName>V1`, `<EventName>V2`) and via
  the `SCHEMA_VERSION` Kafka header.

## Supporting files

- `idempotency.md` — the two-phase `reserveIfNew` / `markProcessed` /
  `release` pattern in detail, plus the Prisma alternative. Read
  before choosing between Redis and Prisma idempotency.
