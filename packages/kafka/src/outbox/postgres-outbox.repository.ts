import { logger } from "@irctc/logger";
import {
  type OutboxRepository,
  type OutboxPrismaClient,
  type OutboxEvent,
  OutboxStatus,
} from "./interfaces.js";

/**
 * Maximum number of publication retries before marking an outbox event as DEAD.
 */
const MAX_RETRY_COUNT = 5;

/**
 * Threshold duration in minutes after which a PROCESSING outbox event is considered stuck.
 */
const STUCK_THRESHOLD_MINUTES = 5;

/**
 * Delays in milliseconds mapped to the retry attempt index.
 */
const BACKOFF_DELAY_MS = [60_000, 120_000, 240_000, 480_000, 960_000];

/**
 * PostgreSQL outbox repository implementation using Prisma Client.
 *
 * Handles database operations for writing events, claiming pending events atomically
 * with locked-row skipping, and managing failed/stuck event states.
 */
export class PostgresOutboxRepository implements OutboxRepository {
  /**
   * Creates an instance of PostgresOutboxRepository.
   *
   * @param prisma - The Prisma Client instance used for database actions.
   */
  constructor(private readonly prisma: OutboxPrismaClient) {}

  /**
   * Appends a new event record to the database outbox queue within the context of an existing transaction.
   *
   * @param tx - The active Prisma transaction client.
   * @param data - The outbox event routing properties and payloads.
   * @returns A promise resolving when the record is saved.
   */
  async insert(
    tx: any,
    data: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      topic: string;
      payload: unknown;
      headers?: unknown;
    },
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        eventType: data.eventType,
        topic: data.topic,
        payload: data.payload,
        headers: data.headers,
      },
    });
  }

  /**
   * Atomically claims a batch of pending outbox events, shifting their status to PROCESSING.
   * Uses SQL `FOR UPDATE SKIP LOCKED` to prevent duplicate processing by concurrent worker instances.
   *
   * @param limit - Maximum size of the batch.
   * @returns A promise resolving to an array of claimed OutboxEvent records.
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
   * Marks an outbox event as successfully PUBLISHED and records the processing timestamp.
   *
   * @param id - UUID of the outbox record.
   * @returns A promise resolving when updated.
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
      logger.warn(
        { module: "outbox-repo", eventId: id },
        "Skipped stale markPublished transition",
      );
      return;
    }

    logger.info(
      { module: "outbox-repo", eventId: id },
      "Outbox event marked as PUBLISHED",
    );
  }

  /**
   * Handles outbox publication failure.
   *
   * Increments the retry count. If it exceeds the maximum retries, the event is marked
   * as DEAD for manual attention. Otherwise, it calculates a backoff delay, computes the next
   * retry timestamp, and transitions the status to FAILED.
   *
   * @param id - UUID of the outbox record.
   * @param error - Diagnostic message explaining the failure.
   * @param currentRetryCount - Current count of retry attempts before this failure.
   * @returns A promise resolving to an object indicating if the event has been classified as DEAD.
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

      logger.error(
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
   * Requeues failed outbox events back to PENDING once their scheduled backoff retry interval
   * has elapsed.
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
      logger.info(
        { module: "outbox-repo", count: result.count },
        "Re-queued failed events for retry (backoff delay elapsed)",
      );
    }
  }

  /**
   * Scans and resets events stuck in the PROCESSING state for longer than the defined threshold
   * back to PENDING. This recovers events lost during sudden worker pod restarts or node crashes.
   *
   * @returns A promise resolving when the scan update is complete.
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
      logger.warn(
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
   * @returns A promise resolving to a status-to-count mapping object.
   */
  async getStatusCounts(): Promise<Record<OutboxStatus, number>> {
    const counts = await this.prisma.outboxEvent.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    return counts.reduce(
      (acc, curr) => {
        acc[curr.status as OutboxStatus] = curr._count.status;
        return acc;
      },
      {} as Record<OutboxStatus, number>,
    );
  }
}
