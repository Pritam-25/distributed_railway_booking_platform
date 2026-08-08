import { injectTraceContextToKafkaHeaders } from "@irctc/telemetry";
import { KAFKA_HEADERS } from "../headers/kafka-headers.js";
import type { LoggerLike } from "../consumer-runner/kafka-consumer-runner.js";
import {
  type OutboxRepository,
  type OutboxPrismaClient,
  type OutboxEvent,
  type CreateOutboxEventData,
  OutboxStatus,
} from "./interfaces.js";

/** Maximum publication retry attempt threshold before marking an outbox event record as DEAD (5). */
const MAX_RETRY_COUNT = 5;

/** Threshold duration in minutes (5) after which a PROCESSING outbox event is classified as stuck/orphaned. */
const STUCK_THRESHOLD_MINUTES = 5;

/** Exponential backoff delay intervals in milliseconds mapped to retry attempt indices. */
const BACKOFF_DELAY_MS = [60_000, 120_000, 240_000, 480_000, 960_000];

/**
 * PostgreSQL implementation of {@link OutboxRepository} using Prisma Client.
 */
export class PostgresOutboxRepository implements OutboxRepository {
  /**
   * Creates an instance of PostgresOutboxRepository.
   *
   * @param prisma - Prisma database client satisfying {@link OutboxPrismaClient}.
   * @param logger - Optional diagnostic logger satisfying {@link LoggerLike}.
   */
  constructor(
    private readonly prisma: OutboxPrismaClient,
    private readonly logger?: LoggerLike,
  ) {}

  /**
   * Appends a new outbox event record within an active database transaction.
   *
   * Must be called using the active transaction handle (`tx`) associated with aggregate updates.
   *
   * @param tx - Active database transaction handle satisfying {@link OutboxPrismaClient}.
   * @param data - {@link CreateOutboxEventData} containing event attributes and body payload.
   * @returns A promise resolving when the record is saved.
   */
  async insert(
    tx: OutboxPrismaClient,
    data: CreateOutboxEventData,
  ): Promise<void> {
    const rawHeaders =
      data.headers && typeof data.headers === "object"
        ? (data.headers as Record<string, string>)
        : {};

    const headers = injectTraceContextToKafkaHeaders({
      [KAFKA_HEADERS.EVENT_TYPE]: data.eventType,
      ...rawHeaders,
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        eventType: data.eventType,
        topic: data.topic,
        payload: data.payload,
        headers,
      },
    });
  }

  /**
   * Atomically claims a batch of pending outbox events, shifting status to `PROCESSING`.
   *
   * Uses SQL `FOR UPDATE SKIP LOCKED` inside a transaction to prevent duplicate processing by concurrent workers.
   *
   * @param limit - Maximum size of the batch to claim.
   * @returns Array of claimed {@link OutboxEvent} records.
   */
  async claimPendingEvents(limit: number): Promise<OutboxEvent[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const pendingEvents = await tx.$queryRaw<
          Array<{
            id: string;
            topic: string;
            aggregateId: string;
            payload: unknown;
            headers: unknown;
            retryCount: number;
          }>
        >`
            SELECT 
                id, 
                topic, 
                aggregate_id AS "aggregateId", 
                payload,
                headers,
                retry_count AS "retryCount"
            FROM outbox_events
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
            `;

        if (pendingEvents.length === 0) return [];

        const ids = pendingEvents.map((event: { id: string }) => event.id);

        await tx.outboxEvent.updateMany({
          where: { id: { in: ids } },
          data: { status: OutboxStatus.PROCESSING },
        });

        return pendingEvents;
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  /**
   * Marks an outbox event record as successfully `PUBLISHED`.
   *
   * @param id - UUID primary key of the outbox record.
   * @returns A promise resolving when the update completes.
   */
  async markPublished(id: string): Promise<void> {
    const updated = await this.prisma.outboxEvent.updateMany({
      where: { id, status: OutboxStatus.PROCESSING },
      data: {
        status: OutboxStatus.PUBLISHED,
        processedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      this.logger?.warn(
        { module: "outbox-repo", eventId: id },
        "Skipped stale markPublished transition",
      );
      return;
    }

    this.logger?.info(
      { module: "outbox-repo", eventId: id },
      "Outbox event marked as PUBLISHED",
    );
  }

  /**
   * Handles outbox publication failure state transitions.
   *
   * Increments `retryCount`. If the attempt count reaches `MAX_RETRY_COUNT` (5), transitions status to `DEAD`.
   * Otherwise, calculates backoff delay using {@link BACKOFF_DELAY_MS} and sets status to `FAILED` with `nextRetryAt`.
   *
   * @param id - UUID primary key of the outbox record.
   * @param error - Diagnostic error description string.
   * @param currentRetryCount - Retry count prior to this failure.
   * @returns Object indicating whether the record became `DEAD`.
   */
  async markFailed(
    id: string,
    error: string,
    currentRetryCount: number,
  ): Promise<{ becameDead: boolean }> {
    const newRetryCount = currentRetryCount + 1;

    if (newRetryCount >= MAX_RETRY_COUNT) {
      const updated = await this.prisma.outboxEvent.updateMany({
        where: {
          id,
          status: OutboxStatus.PROCESSING,
          retryCount: currentRetryCount,
        },
        data: {
          status: OutboxStatus.DEAD,
          errorMessage: error,
          retryCount: newRetryCount,
          processedAt: new Date(),
        },
      });

      if (updated.count === 0) return { becameDead: false };

      this.logger?.error(
        {
          module: "outbox-repo",
          eventId: id,
          retryCount: newRetryCount,
          error,
        },
        "Outbox event marked as DEAD after exceeding max retry count - requires manual intervention",
      );

      return { becameDead: true };
    }

    const delayMs =
      BACKOFF_DELAY_MS[currentRetryCount] ?? BACKOFF_DELAY_MS.at(-1)!;

    const nextRetryAt = new Date(Date.now() + delayMs);

    const updated = await this.prisma.outboxEvent.updateMany({
      where: {
        id,
        status: OutboxStatus.PROCESSING,
        retryCount: currentRetryCount,
      },
      data: {
        status: OutboxStatus.FAILED,
        errorMessage: error,
        retryCount: newRetryCount,
        nextRetryAt,
      },
    });

    if (updated.count === 0) return { becameDead: false };

    return { becameDead: false };
  }

  /**
   * Requeues failed outbox events back to `PENDING` once their backoff delay timestamp has passed.
   *
   * @returns A promise resolving when the scan update is complete.
   */
  async requeueFailedEvents(): Promise<void> {
    const now = new Date();

    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        status: OutboxStatus.FAILED,
        nextRetryAt: { lte: now },
        retryCount: { lt: MAX_RETRY_COUNT },
      },
      data: {
        status: OutboxStatus.PENDING,
        nextRetryAt: null,
      },
    });

    if (result.count > 0) {
      this.logger?.info(
        { module: "outbox-repo", count: result.count },
        "Re-queued failed events for retry (backoff delay elapsed)",
      );
    }
  }

  /**
   * Scans and resets events stuck in `PROCESSING` state for longer than 5 minutes back to `PENDING`.
   *
   * Recovers events abandoned due to unexpected node crashes or process exits.
   *
   * @returns A promise resolving when the scan update completes.
   */
  async resetStuckProcessingEvents(): Promise<void> {
    const threshold = new Date(
      Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000,
    );

    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        status: OutboxStatus.PROCESSING,
        updatedAt: { lt: threshold },
      },
      data: {
        status: OutboxStatus.PENDING,
      },
    });

    if (result.count > 0) {
      this.logger?.warn(
        {
          module: "outbox-repo",
          count: result.count,
        },
        "Recovered stuck PROCESSING events",
      );
    }
  }

  /**
   * Aggregates and returns count statistics for outbox records grouped by status.
   *
   * @returns Status-to-count mapping dictionary object.
   */
  async getStatusCounts(): Promise<Record<OutboxStatus, number>> {
    const counts = (await this.prisma.outboxEvent.groupBy({
      by: ["status"],
      _count: { status: true },
    })) as unknown as Array<{
      status: OutboxStatus;
      _count: { status: number };
    }>;

    return counts.reduce(
      (acc, curr) => {
        acc[curr.status as OutboxStatus] = curr._count.status;
        return acc;
      },
      {} as Record<OutboxStatus, number>,
    );
  }
}
