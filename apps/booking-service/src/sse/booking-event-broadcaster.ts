/**
 * ## module/booking-event-broadcaster
 *
 * Single-instance Kafka consumer that drains `BOOKING_STATUS_CHANGED`
 * events from the outbox publisher and re-broadcasts them onto a
 * Redis pub/sub channel keyed by the booking id. The SSE controller
 * subscribes to that channel per browser connection.
 *
 * ### Fan-out architecture
 * ```
 *   booking-service outbox publisher
 *          │  Kafka topic BOOKING_STATUS_CHANGED
 *          ▼
 *   BookingEventBroadcaster  (1 per service instance)
 *          │  redis.publish(`booking:status:<bookingId>`, payload)
 *          ▼
 *   Redis pub/sub
 *          │
 *          ▼
 *   N SSE connections (one per browser tab)
 * ```
 *
 * ### Idempotency
 * Re-delivery of the same Kafka message just re-publishes to Redis.
 * Browsers already deduplicate by `eventId` on the consumer side.
 */

import {
  type EachMessagePayload,
  type KafkaConsumerRunner,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { Redis } from "@irctc/redis";
import {
  BookingStatusChangedV1,
  type BookingStatusChangedV1Type,
  KAFKA_TOPICS,
} from "@irctc/contracts";

/**
 * Builds the Redis pub/sub channel name for a given booking id.
 *
 * @param bookingId - The booking UUID.
 * @returns The channel name (e.g. `booking:status:5d2f...`).
 */
export function bookingStatusChannel(bookingId: string): string {
  return `booking:status:${bookingId}`;
}

/**
 * Kafka consumer that fans out `BookingStatusChangedV1` events to a
 * Redis pub/sub channel per booking id. SSE controllers subscribe to
 * the channel and forward messages to connected browsers.
 *
 * ### Responsibilities
 * - Subscribe to the `BOOKING_STATUS_CHANGED` topic via {@link KafkaConsumerRunner}.
 * - Parse every message through the {@link BookingStatusChangedV1} Zod schema.
 * - Publish the parsed event payload to `booking:status:<bookingId>` on Redis.
 *
 * ### Error handling
 * Parse failures are non-retryable (the producer is broken — retrying
 * won't help) and logged without rethrow; the runner will commit the
 * offset and move on. Redis publish failures are transient — the error
 * is rethrown so Kafka retries the message.
 */
export class BookingEventBroadcaster {
  /**
   * Creates an instance of BookingEventBroadcaster.
   *
   * @param runner - Kafka subscription loop runner.
   * @param redis - Redis client used for pub/sub `PUBLISH`.
   * @param logger - Project Pino logger.
   */
  constructor(
    private readonly runner: KafkaConsumerRunner,
    private readonly redis: Redis,
    private readonly logger: typeof irctcLogger,
  ) {
    this.logger = logger.child({ module: "booking-event-broadcaster" });
  }

  /**
   * Parses a Kafka message and forwards the event to Redis.
   *
   * @param payload - Kafka broker message context.
   */
  private async handle(payload: EachMessagePayload): Promise<void> {
    const { message, heartbeat } = payload;
    if (message.value === null) return;

    let event: BookingStatusChangedV1Type;
    try {
      event = BookingStatusChangedV1.parse(
        JSON.parse(message.value.toString("utf8")),
      );
    } catch (err) {
      // Parse failures are non-retryable. Committing the offset so the
      // broker doesn't get stuck on a poison pill.
      this.logger.error(
        {
          err:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
          messageKey: message.key?.toString("utf8"),
        },
        "Failed to parse BookingStatusChangedV1 (non-retryable). Committing offset and discarding.",
      );
      await heartbeat();
      return;
    }

    try {
      await this.redis.publish(
        bookingStatusChannel(event.bookingId),
        JSON.stringify(event),
      );
      this.logger.info(
        {
          bookingId: event.bookingId,
          status: event.currentStatus,
          version: event.version,
        },
        "BookingStatusChangedV1 fan-out to Redis",
      );
    } catch (err) {
      // Redis publish failure → transient → rethrow for retry.
      this.logger.error(
        {
          err:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
          bookingId: event.bookingId,
        },
        "Failed to publish BookingStatusChangedV1 to Redis pub/sub. Retrying.",
      );
      throw err;
    } finally {
      await heartbeat();
    }
  }

  /**
   * Boots the subscriber loop on the `BOOKING_STATUS_CHANGED` topic.
   */
  async start(): Promise<void> {
    await this.runner.run(KAFKA_TOPICS.BOOKING_STATUS_CHANGED, (payload) =>
      this.handle(payload),
    );
  }

  /**
   * Stops the consumer subscription and gracefully disconnects from the broker.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }
}
