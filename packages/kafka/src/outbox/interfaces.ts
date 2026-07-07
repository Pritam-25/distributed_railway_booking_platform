/**
 * Represents the lifecycle state of a transactional outbox event.
 */
export enum OutboxStatus {
  /**
   * The event has been recorded in the database but has not yet been processed by the worker.
   */
  PENDING = "PENDING",
  /**
   * The event has been claimed by a publisher worker and is currently in-flight to Kafka.
   */
  PROCESSING = "PROCESSING",
  /**
   * The event has been successfully delivered and acknowledged by the Kafka broker.
   */
  PUBLISHED = "PUBLISHED",
  /**
   * Publishing failed due to a transient error; pending retry.
   */
  FAILED = "FAILED",
  /**
   * The event has exhausted all retry attempts and requires manual intervention.
   */
  DEAD = "DEAD",
}

/**
 * Minimally defined interface for the database client, matching the Prisma operations
 * required by the outbox repository.
 */
export interface OutboxPrismaClient {
  outboxEvent: {
    create(args: { data: any }): Promise<any>;
    updateMany(args: { where: any; data: any }): Promise<{ count: number }>;
    groupBy(args: any): Promise<any[]>;
  };
  $queryRaw<T = any>(query: TemplateStringsArray, ...values: any[]): Promise<T>;
  $transaction<T>(
    fn: (tx: any) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

/**
 * Represents an outbox event entity retrieved from the storage engine.
 */
export interface OutboxEvent {
  /** Unique identifier of the outbox record (usually UUID). */
  id: string;
  /** The target Kafka topic this message should be routed to. */
  topic: string;
  /** The correlation ID / aggregate ID used as the Kafka message key (for partition locking). */
  aggregateId: string;
  /** The raw event payload body. */
  payload: unknown;
  /** Optional metadata headers accompanying the payload. */
  headers?: unknown;
  /** The number of times publishing this specific event has failed. */
  retryCount: number;
}

/**
 * Repository interface defining database-level operations for the Transactional Outbox pattern.
 */
export interface OutboxRepository {
  /**
   * Persists a new event record to the outbox database within an active transaction.
   *
   * @param tx - The active database transaction client.
   * @param data - The outbox message payload and routing details.
   */
  insert(
    tx: any,
    data: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      topic: string;
      payload: unknown;
      headers?: unknown;
    },
  ): Promise<void>;

  /**
   * Claims a limited batch of pending outbox events, transitioning their status to PROCESSING.
   * Uses lock skip features to ensure safety when multiple worker processes run concurrently.
   *
   * @param limit - Maximum number of events to claim in this batch.
   * @returns A promise resolving to the list of claimed events.
   */
  claimPendingEvents(limit: number): Promise<OutboxEvent[]>;

  /**
   * Marks an outbox event as successfully sent to Kafka (transitions status to PUBLISHED).
   *
   * @param id - The ID of the outbox event.
   */
  markPublished(id: string): Promise<void>;

  /**
   * Records a publishing failure for the outbox event, incrementing retry count.
   * If the failure count exceeds maximum limits, the event transitions to DEAD.
   *
   * @param id - The ID of the outbox event.
   * @param error - The error message that occurred.
   * @param currentRetryCount - The retry count prior to this failure.
   * @returns A promise indicating if the event was marked as DEAD.
   */
  markFailed(
    id: string,
    error: string,
    currentRetryCount: number,
  ): Promise<{ becameDead: boolean }>;

  /**
   * Scans and resets events stuck in the PROCESSING state (e.g. from crashed publisher pods)
   * back to PENDING so other active workers can process them.
   */
  resetStuckProcessingEvents(): Promise<void>;

  /**
   * Requeues failed outbox events back to PENDING once their scheduled backoff retry interval
   * has elapsed.
   */
  requeueFailedEvents(): Promise<void>;

  /**
   * Aggregates and returns count statistics for outbox records grouped by status.
   */
  getStatusCounts(): Promise<Record<OutboxStatus, number>>;
}
