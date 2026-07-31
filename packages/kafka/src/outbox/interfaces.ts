/**
 * Represents the lifecycle state machine of a transactional outbox event entity.
 */
export enum OutboxStatus {
  /** Recorded in the database transaction; waiting for the publisher worker poll cycle. */
  PENDING = "PENDING",
  /** Claimed by an active publisher worker; currently in-flight to Kafka. */
  PROCESSING = "PROCESSING",
  /** Successfully published and acknowledged by the Kafka broker cluster. */
  PUBLISHED = "PUBLISHED",
  /** Publication attempt failed due to a transient error; scheduled for backoff retry. */
  FAILED = "FAILED",
  /** Maximum retry limit exceeded; requires manual operator investigation or replay. */
  DEAD = "DEAD",
}

/**
 * Minimal database client interface matching Prisma operations required by the outbox repository.
 */
export interface OutboxPrismaClient {
  /** Outbox table database collection interface. */
  outboxEvent: {
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
    groupBy(args: unknown): Promise<unknown[]>;
  };
  /** Executes raw SQL queries (used for `FOR UPDATE SKIP LOCKED`). */
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  /** Opens a database transaction boundary. */
  $transaction<T>(
    fn: (tx: OutboxPrismaClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

/**
 * Represents an outbox event entity stored in the database.
 */
export interface OutboxEvent {
  /** Unique UUID primary key identifier of the outbox record. */
  id: string;
  /** Destination Kafka topic for the event. */
  topic: string;
  /** Correlation/aggregate ID used as the Kafka message key (for partition hashing). */
  aggregateId: string;
  /** Raw event payload body object. */
  payload: unknown;
  /** Optional metadata headers accompanying the payload. */
  headers?: unknown;
  /** Number of failed publication attempts recorded so far. */
  retryCount: number;
}

/**
 * Data transfer object parameters required to create and record an outbox event.
 */
export interface CreateOutboxEventData {
  /** Domain classification of the aggregate entity (e.g., "Schedule", "Train"). */
  aggregateType: string;
  /** Primary key or business key of the aggregate root entity. */
  aggregateId: string;
  /** Name of the domain event being recorded (e.g., "schedule.created.v1"). */
  eventType: string;
  /** Destination Kafka topic where the message should be routed. */
  topic: string;
  /** Payload content of the event. */
  payload: unknown;
  /** Optional key-value header metadata to attach to the Kafka message. */
  headers?: unknown;
}

/**
 * Persistence repository interface defining outbox operations.
 */
export interface OutboxRepository {
  /**
   * Persists a new outbox event record within an active database transaction.
   *
   * Must be called inside the same transaction as the aggregate entity mutation to guarantee atomicity.
   *
   * @param tx - Active database transaction client satisfying {@link OutboxPrismaClient}.
   * @param data - {@link CreateOutboxEventData} containing event attributes and payload.
   */
  insert(tx: OutboxPrismaClient, data: CreateOutboxEventData): Promise<void>;

  /**
   * Atomically claims a batch of pending events using row-level locking.
   *
   * Transitions claimed event states from `PENDING` to `PROCESSING`. Uses `SKIP LOCKED` SQL semantics to prevent lock contention among concurrent workers.
   *
   * @param limit - Maximum number of events to claim in a single batch.
   * @returns Array of claimed {@link OutboxEvent} records.
   */
  claimPendingEvents(limit: number): Promise<OutboxEvent[]>;

  /**
   * Transitions an outbox record status to `PUBLISHED` upon successful Kafka dispatch.
   *
   * @param id - UUID primary key of the outbox record.
   */
  markPublished(id: string): Promise<void>;

  /**
   * Records a publication failure for an outbox record, incrementing its retry count.
   *
   * If the new retry count reaches maximum limits, transitions status to `DEAD`; otherwise sets status to `FAILED` with backoff schedule.
   *
   * @param id - UUID primary key of the outbox record.
   * @param error - Diagnostic error message string.
   * @param currentRetryCount - Retry count prior to this failure.
   * @returns Object indicating whether the record transitioned to `DEAD`.
   */
  markFailed(
    id: string,
    error: string,
    currentRetryCount: number,
  ): Promise<{ becameDead: boolean }>;

  /**
   * Scans and resets events stuck in `PROCESSING` state back to `PENDING` (e.g. from crashed worker nodes).
   */
  resetStuckProcessingEvents(): Promise<void>;

  /**
   * Requeues failed outbox events back to `PENDING` once their scheduled backoff delay has elapsed.
   */
  requeueFailedEvents(): Promise<void>;

  /**
   * Aggregates and returns count statistics for outbox records grouped by status.
   *
   * @returns Status-to-count mapping object.
   */
  getStatusCounts(): Promise<Record<OutboxStatus, number>>;
}
