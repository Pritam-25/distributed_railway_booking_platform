# Idempotency — the two-phase pattern in detail

Two patterns coexist in this codebase. Pick by what the side effect is.

## When the side effect is external

Use Redis via `@irctc/redis`'s `IdempotencyRepository`. The pattern is
two-phase (`reserveIfNew` → `markProcessed` on success / `release` on
failure). It is implemented today in `apps/notification-service/src/services/otp-notification.service.ts`:

```ts
const reserved = await this.idempotency.reserveIfNew(parsed.eventId);
if (!reserved) {
  // Duplicate. The dedupe row already exists.
  return PROCESSING_STATUS.DUPLICATE;
}

try {
  await this.emailProvider.send(emailOptions);
} catch (err) {
  await this.idempotency.release(parsed.eventId).catch((releaseErr) => {
    this.logger.warn(
      { eventId: parsed.eventId, error: releaseErr },
      "Failed to release idempotency reservation after send failure",
    );
  });
  throw err;
}

await this.idempotency.markProcessed(parsed.eventId);
return PROCESSING_STATUS.PROCESSED;
```

Why two-phase and not `markIfNew`:

- `markIfNew` is one-shot. If the side effect succeeds but the
  `markIfNew` write fails (network blip, Redis restart), the dedupe
  row never lands. Redelivery treats the event as a new one and the
  side effect fires again. For email / payment / third-party calls,
  this means duplicate dispatches.
- `reserveIfNew` writes a `PROCESSING` row with a short lease TTL
  before the side effect. Even if `markProcessed` fails, the lease
  expires (5–30s is typical) and a recovery sweep resets the row so
  redelivery can retry. The side effect is still bounded by the lease
  window — if the lease expires while the side effect is still
  running, redelivery can fire concurrently. Pick a lease TTL longer
  than the worst-case side-effect latency.

Key composition rules:

- The event key is `eventId` (or a domain-stable composite like
  `bookingId + ":hold"`). **Never PII** (no email, no phone, no name).
- `reserveIfNew` returns truthy on success, falsy on duplicate.
- `release` is best-effort — wrap in `.catch` and log a warning if
  it fails. The DLQ will still re-deliver after retry exhaustion.
- `markProcessed` flips the row to a long-TTL `PROCESSED` state
  (default 7 days in `@irctc/redis`).
- The recovery sweep (in `@irctc/redis` / `@irctc/kafka`) resets
  expired `PROCESSING` rows so a crashed worker's events can be
  redelivered.

## When the side effect is a DB write

Use Prisma. The dedupe row goes in the **same transaction** as the
projection write:

```ts
async process(event: <EventName>V1Type): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    // Dedupe first — if the row already exists, the transaction rolls
    // back without the projection update.
    const existing = await this.idempotencyRepository.exists(event.eventId, tx);
    if (existing) return;

    // Projection update + dedupe insert in one transaction.
    await this.projectionRepository.update(event, tx);
    await this.idempotencyRepository.create(event.eventId, tx);
  });
}
```

This pattern is sufficient for read-only consumers that update a
projection table. The two-phase Redis pattern is overkill here
because the dedupe row's existence is enforced by the database
uniqueness constraint.

`IdempotencyRepository` lives in `apps/<svc>/src/repository/idempotency.repo.ts`.
Add it alongside the projection repository; both share the
`PrismaClient` and accept the same `tx?: Prisma.TransactionClient`
parameter. See the `prisma-repository` skill for the transaction
propagation pattern.

## Lease and TTL defaults

`@irctc/redis`'s `IdempotencyRepository` accepts:

- `leaseTtlMs` for `reserveIfNew` — how long a `PROCESSING` row can
  exist before recovery sweeps reset it. Default 30s. Raise for
  known-slow side effects; never lower than 5s.
- `dedupeTtlMs` for `markProcessed` — how long a `PROCESSED` row
  sticks around. Default 7 days. This is the upper bound on
  redelivery window — Kafka's `retention.ms` is the lower bound.

If `dedupeTtlMs > Kafka retention.ms`, a re-delivery older than the
Kafka retention window is impossible, so the `PROCESSED` row is
defensive only. If `dedupeTtlMs < Kafka retention.ms`, you can see
duplicates after the dedupe row expires but Kafka still has the
message.

## When to skip idempotency entirely

Read-only consumers that don't write anywhere — extremely rare in
this codebase. Even the "projection update" consumers above do write
(the projection row), so they need idempotency. The only consumer
that can skip is one whose side effect is _purely informational_
(e.g. updating a debug metric, sending an internal ping). For
everything else, the dedupe row is cheap insurance against duplicate
side effects.
