import { KafkaJS } from "@confluentinc/kafka-javascript";
import { logger } from "@irctc/logger";

type Producer = KafkaJS.Producer;
import { KAFKA_HEADERS } from "../headers/kafka-headers.js";
import type { OutboxRepository, OutboxEvent } from "./interfaces.js";

/**
 * Delay interval in milliseconds between successive database poll cycles.
 */
const POLL_INTERVAL_MS = 2_000;

/**
 * Maximum number of pending outbox events claimed in a single poll batch.
 */
const BATCH_SIZE = 50;

/**
 * Period in milliseconds for scanning and resetting stuck processing events (e.g. from crashed workers).
 */
const RECOVERY_INTERVAL_MS = 60_000;

/**
 * Period in milliseconds for scanning and requeueing failed events after their backoff delay has elapsed.
 */
const RETRY_INTERVAL_MS = 30_000;

/**
 * Transactional Outbox Worker.
 *
 * Implements the transactional outbox pattern by polling event records committed inside application
 * transactions and publishing them to Kafka.
 *
 * It runs a continuous polling loop and schedules recurring maintenance sweeps to recover stuck
 * processing events and retry failed ones.
 */
export class OutboxPublisherWorker {
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private inFlightPoll: Promise<void> | null = null;

  /**
   * Creates an instance of OutboxPublisherWorker.
   *
   * @param outboxRepository - The repository managing the database outbox events.
   * @param getProducer - Function returning the active, connected Kafka Producer.
   */
  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly getProducer: () => Producer,
  ) {}

  /**
   * Starts the outbox polling loop and starts the recovery and retry scheduler intervals.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Main polling loop
    this.schedulePoll();

    // Sweep database for events stuck in PROCESSING due to ungraceful worker crashes.
    this.recoveryTimer = setInterval(async () => {
      try {
        await this.outboxRepository.resetStuckProcessingEvents();
      } catch (error) {
        logger.error(
          { module: "outbox-worker", error },
          "Recovery sweep failed",
        );
      }
    }, RECOVERY_INTERVAL_MS);

    // Requeue failed events whose exponential backoff delays have elapsed.
    this.retryTimer = setInterval(async () => {
      try {
        await this.outboxRepository.requeueFailedEvents();
      } catch (error) {
        logger.error(
          { module: "outbox-worker", error },
          "Retry requeue failed",
        );
      }
    }, RETRY_INTERVAL_MS);

    logger.info({ module: "outbox-worker" }, "Outbox publisher worker started");
  }

  /**
   * Gracefully stops the worker loop and clears all active timers.
   * Awaits any in-flight database polling cycles to complete.
   *
   * @returns A promise resolving when the worker has fully stopped.
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);

    if (this.inFlightPoll) {
      await this.inFlightPoll;
    }

    logger.info({ module: "outbox-worker" }, "Outbox publisher worker stopped");
  }

  /**
   * Schedules the next polling execution if the worker is still active.
   */
  private schedulePoll(): void {
    if (!this.running) return;

    this.pollTimer = setTimeout(async () => {
      try {
        this.inFlightPoll = this.pollAndPublish();
        await this.inFlightPoll;
      } catch (error) {
        logger.error({ module: "outbox-worker", error }, "Poll cycle failed");
      } finally {
        this.inFlightPoll = null;
      }
      this.schedulePoll();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Claims a batch of pending events from the outbox repository and attempts to send them
   * to their respective Kafka topics.
   *
   * Maps trace context event metadata headers (event-type, schema-version, event-id)
   * onto the Kafka message headers to preserve metadata propagation.
   */
  private async pollAndPublish(): Promise<void> {
    const events = await this.outboxRepository.claimPendingEvents(BATCH_SIZE);

    if (events.length === 0) {
      return;
    }

    const producer = this.getProducer();

    for (const event of events) {
      await this.publishEvent(producer, event);
    }
  }

  private async publishEvent(
    producer: Producer,
    event: OutboxEvent,
  ): Promise<void> {
    try {
      await producer.send({
        topic: event.topic,
        messages: [
          {
            key: event.aggregateId,
            value: JSON.stringify(event.payload),
            headers: this.buildHeaders(event),
          },
        ],
      });

      await this.outboxRepository.markPublished(event.id);
    } catch (error) {
      await this.handlePublishFailure(event, error);
    }
  }

  private buildHeaders(event: OutboxEvent): Record<string, string> {
    const headers: Record<string, string> = {};

    this.copyStoredHeaders(event.headers, headers);
    this.addEventIdHeader(event, headers);

    return headers;
  }

  private copyStoredHeaders(
    storedHeaders: unknown,
    headers: Record<string, string>,
  ): void {
    if (!storedHeaders || typeof storedHeaders !== "object") {
      return;
    }

    const stored = storedHeaders as Record<string, string | undefined>;

    this.copyHeader(stored, headers, KAFKA_HEADERS.EVENT_TYPE);
    this.copyHeader(stored, headers, KAFKA_HEADERS.SCHEMA_VERSION);
  }

  private copyHeader(
    source: Record<string, string | undefined>,
    target: Record<string, string>,
    key: string,
  ): void {
    const value = source[key];

    if (value) {
      target[key] = value;
    }
  }

  private addEventIdHeader(
    event: OutboxEvent,
    headers: Record<string, string>,
  ): void {
    const payload = event.payload as Record<string, unknown>;

    const eventId = payload?.eventId;

    if (eventId == null) {
      return;
    }

    if (typeof eventId === "string" || typeof eventId === "number") {
      headers[KAFKA_HEADERS.EVENT_ID] = String(eventId);
      return;
    }

    logger.warn(
      {
        module: "outbox-worker",
        eventId: event.id,
      },
      "payload.eventId is not a string or number",
    );
  }

  private async handlePublishFailure(
    event: OutboxEvent,
    error: unknown,
  ): Promise<void> {
    try {
      await this.outboxRepository.markFailed(
        event.id,
        String(error),
        event.retryCount ?? 0,
      );
    } catch (markError) {
      logger.error(
        {
          module: "outbox-worker",
          eventId: event.id,
          markError,
        },
        "Failed to persist outbox failure state",
      );
    }

    logger.error(
      {
        module: "outbox-worker",
        eventId: event.id,
        error,
      },
      "Failed to publish outbox event to Kafka",
    );
  }
}
