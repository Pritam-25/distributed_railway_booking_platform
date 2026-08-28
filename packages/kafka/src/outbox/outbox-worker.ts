import { KafkaJS } from "@confluentinc/kafka-javascript";
import { injectTraceContextToKafkaHeaders } from "@irctc/telemetry";
import type { LoggerLike } from "../consumer-runner/kafka-consumer-runner.js";
import { KAFKA_HEADERS } from "../headers/kafka-headers.js";
import type { OutboxRepository, OutboxEvent } from "./interfaces.js";

type Producer = KafkaJS.Producer;
/** Delay interval in milliseconds between successive database polling cycles (2 seconds). */
const POLL_INTERVAL_MS = 2_000;

/** Maximum batch size of outbox events claimed per polling iteration. */
const BATCH_SIZE = 50;

/** Interval in milliseconds for scanning and resetting orphaned PROCESSING events (60 seconds). */
const RECOVERY_INTERVAL_MS = 60_000;

/** Interval in milliseconds for scanning and requeueing backoff-completed FAILED events (30 seconds). */
const RETRY_INTERVAL_MS = 30_000;

/**
 * Background outbox publisher worker managing polling loops and event dispatches.
 */
export class OutboxPublisherWorker {
  /** Indicates whether the worker background loops and timers are active. */
  private running = false;
  /** Timer handle for the recurring outbox polling cycle. */
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timer handle for the recovery interval resetting stuck `PROCESSING` events. */
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  /** Timer handle for the retry interval requeueing backoff-completed `FAILED` events. */
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  /** Promise tracking the currently executing poll and publish iteration. */
  private inFlightPoll: Promise<void> | null = null;
  /** Promise tracking the currently executing recovery sweep operation. */
  private inFlightRecovery: Promise<void> | null = null;
  /** Promise tracking the currently executing retry requeue operation. */
  private inFlightRetry: Promise<void> | null = null;

  /**
   * Creates an instance of OutboxPublisherWorker.
   *
   * @param outboxRepository - {@link OutboxRepository} managing database outbox event records.
   * @param getProducer - Supplier function returning the connected shared {@link Producer} instance.
   * @param logger - Optional diagnostic logger satisfying {@link LoggerLike}.
   */
  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly getProducer: () => Producer,
    private readonly logger?: LoggerLike,
  ) {}

  /**
   * Starts the background outbox polling loop and starts recovery and retry interval timers.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Main polling loop
    this.schedulePoll();

    // Sweep database for events stuck in PROCESSING due to ungraceful worker crashes.
    this.recoveryTimer = setInterval(() => {
      if (!this.running) return;
      this.inFlightRecovery = (async () => {
        try {
          await this.outboxRepository.resetStuckProcessingEvents();
        } catch (error) {
          this.logger?.error(
            { module: "outbox-worker", error },
            "Recovery sweep failed",
          );
        } finally {
          this.inFlightRecovery = null;
        }
      })();
    }, RECOVERY_INTERVAL_MS);

    // Requeue failed events whose exponential backoff delays have elapsed.
    this.retryTimer = setInterval(() => {
      if (!this.running) return;
      this.inFlightRetry = (async () => {
        try {
          await this.outboxRepository.requeueFailedEvents();
        } catch (error) {
          this.logger?.error(
            { module: "outbox-worker", error },
            "Retry requeue failed",
          );
        } finally {
          this.inFlightRetry = null;
        }
      })();
    }, RETRY_INTERVAL_MS);

    this.logger?.info(
      { module: "outbox-worker" },
      "Outbox publisher worker started.",
    );
  }

  /**
   * Gracefully stops the worker loop and clears all active scheduler timers.
   *
   * Awaits completion of any active in-flight database polling, recovery, or retry cycles before returning.
   *
   * @returns A promise resolving when the worker cycle has safely terminated.
   */
  async stop(): Promise<void> {
    this.logger?.info(
      { module: "outbox-worker" },
      "Stopping outbox publisher worker...",
    );

    this.running = false;

    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);

    await Promise.allSettled([
      this.inFlightPoll,
      this.inFlightRecovery,
      this.inFlightRetry,
    ]);

    this.inFlightPoll = null;
    this.inFlightRecovery = null;
    this.inFlightRetry = null;

    this.logger?.info(
      { module: "outbox-worker" },
      "Outbox publisher worker stopped",
    );
  }

  /**
   * Schedules the next database polling cycle using a timeout loop.
   *
   * Triggers {@link pollAndPublish} and tracks the execution promise in `inFlightPoll`
   * to guarantee that `stop()` can await completion of an active poll cycle before halting.
   */
  private schedulePoll(): void {
    if (!this.running) return;

    this.pollTimer = setTimeout(async () => {
      try {
        this.inFlightPoll = this.pollAndPublish();
        await this.inFlightPoll;
      } catch (error) {
        this.logger?.error(
          { module: "outbox-worker", error },
          "Poll cycle failed",
        );
      } finally {
        this.inFlightPoll = null;
      }
      this.schedulePoll();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Claims a batch of pending outbox events from the repository and publishes each event to Kafka.
   *
   * If no pending events are claimed, returns immediately. Otherwise, iterates over the batch
   * and delegates dispatching to {@link publishEvent}.
   *
   * @returns A promise resolving when all claimed events in the batch have been processed.
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

  /**
   * Serializes and publishes a single outbox event to its target Kafka topic.
   *
   * On successful dispatch, marks the event as `PUBLISHED` in the database.
   * If dispatch fails, delegates failure handling to {@link handlePublishFailure}.
   *
   * @param producer - The active connected {@link Producer} instance.
   * @param event - The {@link OutboxEvent} record to publish.
   * @returns A promise resolving when publishing and status recording complete.
   */
  private async publishEvent(
    producer: Producer,
    event: OutboxEvent,
  ): Promise<void> {
    try {
      const headers = this.buildHeaders(event);

      await producer.send({
        topic: event.topic,
        messages: [
          {
            key: event.aggregateId,
            value: JSON.stringify(event.payload),
            headers,
          },
        ],
      });

      await this.outboxRepository.markPublished(event.id);

      const payloadObj =
        event.payload && typeof event.payload === "object"
          ? (event.payload as Record<string, unknown>)
          : {};

      this.logger?.info(
        {
          module: "outbox-worker",
          eventId:
            headers[KAFKA_HEADERS.EVENT_ID] ?? payloadObj.eventId ?? event.id,
        },
        `Outbox event successfully published to topic ${event.topic}`,
      );
    } catch (error) {
      await this.handlePublishFailure(event, error);
    }
  }

  /**
   * Constructs the Kafka message headers dictionary for an outbox event.
   *
   * Merges event-type, schema-version, trace context, and metadata from stored event headers.
   *
   * @param event - The {@link OutboxEvent} containing headers and payload metadata.
   * @returns A key-value dictionary of string headers for the Kafka message.
   */
  private buildHeaders(event: OutboxEvent): Record<string, string> {
    const headers: Record<string, string> = {};

    this.copyStoredHeaders(event.headers, headers);
    this.addEventIdHeader(event, headers);

    if (!headers["traceparent"]) {
      return injectTraceContextToKafkaHeaders(headers) as Record<
        string,
        string
      >;
    }

    return headers;
  }

  /**
   * Copies stored metadata headers into the target headers object.
   *
   * @param storedHeaders - Raw stored header object from the outbox record.
   * @param headers - Target header key-value dictionary to mutate.
   */
  private copyStoredHeaders(
    storedHeaders: unknown,
    headers: Record<string, string>,
  ): void {
    if (!storedHeaders || typeof storedHeaders !== "object") {
      return;
    }

    const stored = storedHeaders as Record<string, unknown>;

    for (const [key, value] of Object.entries(stored)) {
      if (value != null) {
        headers[key] = String(value);
      }
    }
  }

  /**
   * Copies a single header key from a source dictionary to a target dictionary if present.
   *
   * @param source - Source header object map.
   * @param target - Target header map to mutate.
   * @param key - The header key name to copy (e.g. `x-event-type`).
   */
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

  /**
   * Extracts `eventId` from the event payload object and sets the `x-event-id` Kafka header.
   *
   * If `eventId` is a string or number, sets `x-event-id` on `headers`. Logs a warning if the `eventId`
   * field is present but has an unexpected data type.
   *
   * @param event - The {@link OutboxEvent} containing the payload to inspect.
   * @param headers - Target header map to mutate.
   */
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

    this.logger?.warn(
      {
        module: "outbox-worker",
        eventId: event.id,
      },
      "payload.eventId is not a string or number",
    );
  }

  /**
   * Handles publishing failures by recording failure state in the outbox repository and logging diagnostics.
   *
   * Increments the retry count and computes backoff schedule, marking the event as `FAILED` or `DEAD`.
   *
   * @param event - The {@link OutboxEvent} whose publishing failed.
   * @param error - The error caught during message dispatch.
   * @returns A promise resolving when failure status persistence and logging complete.
   */
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
      this.logger?.error(
        {
          module: "outbox-worker",
          eventId: event.id,
          markError,
        },
        "Failed to persist outbox failure state",
      );
    }

    this.logger?.error(
      {
        module: "outbox-worker",
        eventId: event.id,
        error,
      },
      "Failed to publish outbox event to Kafka",
    );
  }
}
