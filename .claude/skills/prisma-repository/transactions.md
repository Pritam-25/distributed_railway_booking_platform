# Transactions — the four patterns

This codebase has four transaction patterns. Use the right one for the
right flow — picking the wrong one is either too cautious (locks during
network I/O) or too lax (inconsistent writes).

## Pattern A — state change + outbox event

The most common case. The business operation writes an aggregate and
publishes an event describing the change. Both must commit atomically.

```ts
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
      headers: {
        [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
        [KAFKA_HEADERS.EVENT_TYPE]: "TRAIN_CREATED",
      },
    });
    return train;
  });
}
```

Key properties:

- Atomic. Either both land or neither does.
- The transaction body never awaits Kafka publish. The outbox worker
  drains the table after commit.
- The aggregate UUID becomes the Kafka partition key (`aggregateId`).

Use this for every business mutation that publishes an event.

## Pattern B — cross-aggregate read inside the transaction

When the decision depends on another aggregate's state in the same
write, read it via `tx.<model>` (the transaction client), not via a
repository of another aggregate. The read must be inside the
transaction to share the snapshot.

```ts
async removeOperatingDays(dayIds: string[]): Promise<void> {
  return await this.prisma.$transaction(async (tx) => {
    // Cross-aggregate read — must be tx, not prisma.
    const futureSchedules = await tx.schedule.findMany({
      where: { operatingDayId: { in: dayIds }, departureAt: { gte: new Date() } },
    });
    if (futureSchedules.length > 0) {
      throw new ApiError(
        statusCode.conflict,
        ERROR_CODES.OPERATING_DAYS_REFERENCED,
        "Cannot remove operating days that have active future schedules.",
      );
    }

    await this.operatingDayRepository.deleteMany(dayIds, tx);
    await this.outboxRepository.insert(tx, { /* OPERATING_DAYS_REMOVED event */ });
  });
}
```

The cross-aggregate read uses the `tx` client directly because:

- It's read-only on the foreign aggregate.
- Adding a repository for a single `findMany` would leak the
  cross-aggregate concern into the foreign aggregate's API.
- The read must share the transaction's snapshot for consistency.

This is the **only** exception to "services never call Prisma
directly" in `rules/architecture.md`. It applies only inside a
`$transaction` callback.

## Pattern C — conditional insert

When the state change depends on the absence of a competing record,
do the read and the insert in the same transaction. The race
window between read and write is closed by the transaction.

```ts
async addOperatingDay(trainId: string, day: OperatingDay): Promise<void> {
  return await this.prisma.$transaction(async (tx) => {
    const train = await this.trainRepository.getTrainById(trainId, tx);
    if (!train) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
    }

    // Race-free insert: the unique constraint on (trainId, dayOfWeek)
    // will reject a duplicate. Catch P2002 → duplicate-day error code.
    try {
      await this.operatingDayRepository.create(
        { train: { connect: { id: trainId } }, dayOfWeek: day.dayOfWeek },
        tx,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.OPERATING_DAY_ALREADY_EXISTS,
        );
      }
      throw error;
    }

    await this.outboxRepository.insert(tx, { /* OPERATING_DAY_ADDED event */ });
  });
}
```

The unique constraint is the actual race closer; the transaction
just lets the catch see the result.

## Pattern D — cascade update

When the state change in aggregate A implies changes in aggregates
B / C, all live in the same transaction. The outbox table may
receive multiple events.

```ts
async deactivateRoute(routeId: string): Promise<void> {
  return await this.prisma.$transaction(async (tx) => {
    const route = await this.routeRepository.getById(routeId, tx);
    if (!route) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
    }

    await this.routeRepository.update(routeId, { isActive: false }, tx);
    await this.stationRepository.markRouteInactive(route.stationIds, tx);
    await this.scheduleRepository.markRouteInactive(routeId, tx);

    await this.outboxRepository.insert(tx, {
      aggregateType: "Route",
      aggregateId: routeId,
      eventType: "ROUTE_DEACTIVATED",
      topic: KAFKA_TOPICS.ADMIN_ROUTE_DEACTIVATED,
      payload: RouteEventMapper.toDeactivatedEvent(route),
      headers: { /* ... */ },
    });

    // Optionally: one event per cascading aggregate. Pick the right
    // cardinality for the consumers; if multiple consumers care,
    // emit one event per aggregate type.
  });
}
```

## What never to do inside `$transaction`

- `await producer.send(...)` — Redis or Kafka publish holds network
  I/O during the lock. Use the outbox publisher for Kafka; use
  Redis `SET NX EX` locks (not Redis transactions) for short-lived
  coordination.
- `await fetch(...)` (external HTTP) — same network I/O concern.
- `await grpcClient.<method>(...)` — same.
- `await this.someAsyncQueue.enqueue(...)` unless you have measured
  the queue is local. Most queue libraries hold network sockets.

The rule: **inside `$transaction`, the only I/O is Prisma**. Anything
else is the outbox worker's job.

## Lock ordering

When two transactions touch overlapping aggregates in different
orders, you get deadlocks. Pick a deterministic order — typically
by aggregate UUID or by a hardcoded "lock hierarchy":

```ts
// Lock order: trains → routes → schedules.
// If two transactions both touch (train, route), the lower UUID acts
// as the tiebreaker; both transactions acquire in the same order.
const sortedIds = [trainId, routeId].sort();
```

Or, more pragmatically, keep transactions short and on a single
aggregate when possible. The cross-aggregate cases are rare
(operating-day removal above is one); most patterns are A or C.

## Optimistic concurrency

Aggregates that consumers update (`ScheduleInventory`,
`SeatInventory`, `SeatAllocation`) carry a `version: Int` column.
Updates must include `{ id, version }` in the `where` and increment
`version`:

```ts
async bumpVersion(id: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? this.prisma;
  const row = await client.seatInventory.findUnique({ where: { id } });
  if (!row) throw new ApiError(statusCode.notFound, ERROR_CODES.SEAT_NOT_FOUND);

  return client.seatInventory.update({
    where: { id, version: row.version }, // optimistic lock
    data: { version: row.version + 1 },
  });
}
```

A stale write returns `P2025` → translate to `NOT_FOUND` or a
domain-specific code. Consumers must retry on version conflict.

## Summary

| Pattern                   | When to use                                   | Outbox?                      |
| ------------------------- | --------------------------------------------- | ---------------------------- |
| A — state change + outbox | any business mutation that publishes          | yes                          |
| B — cross-aggregate read  | decision depends on foreign aggregate's state | usually                      |
| C — conditional insert    | insert depends on absence                     | yes                          |
| D — cascade update        | state change implies multiple aggregates      | yes (one per aggregate type) |

Every business mutation lives in one of these four patterns. If a
flow doesn't fit, decompose it into multiple patterns in separate
service methods.
