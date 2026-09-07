import {
  type EachMessagePayload,
  type KafkaConsumerRunner,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import {
  BookingStatusChangedV1,
  type BookingStatusChangedV1Type,
  KAFKA_TOPICS,
} from "@irctc/contracts";
import type { BookingEventRouter } from "./booking-event-router.js";

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
 * Single-instance Kafka consumer component.
 *
 * Listens for `BOOKING_STATUS_CHANGED` events on Kafka and delegates to
 * {@link BookingEventRouter} (either local or Redis Pub/Sub distributed).
 */
export class BookingEventBroadcaster {
  private readonly logger: typeof irctcLogger;

  /**
   * Creates an instance of BookingEventBroadcaster.
   *
   * @param kafkaConsumer - Managed Kafka consumer runner.
   * @param eventRouter - Event router strategy (local vs distributed pub/sub).
   * @param loggerInstance - Structured pino logger instance.
   */
  constructor(
    private readonly kafkaConsumer: KafkaConsumerRunner,
    private readonly eventRouter: BookingEventRouter,
    loggerInstance: typeof irctcLogger,
  ) {
    this.logger = loggerInstance.child({
      module: "booking-event-broadcaster",
    });
  }

  /**
   * Starts the Kafka consumer subscribed to topic `BOOKING_STATUS_CHANGED`.
   */
  async start(): Promise<void> {
    await this.kafkaConsumer.run(
      KAFKA_TOPICS.BOOKING_STATUS_CHANGED,
      async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    );

    this.logger.info(
      { topic: KAFKA_TOPICS.BOOKING_STATUS_CHANGED },
      "BookingEventBroadcaster listening for status updates",
    );
  }

  /**
   * Stops the Kafka consumer.
   */
  async stop(): Promise<void> {
    await this.kafkaConsumer.disconnect();
    this.logger.info("BookingEventBroadcaster stopped");
  }

  /**
   * Handlers a single Kafka message payload, parses `BookingStatusChangedV1`,
   * and routes it via {@link BookingEventRouter}.
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const rawValue = payload.message.value?.toString();
    if (!rawValue) {
      this.logger.warn("Received empty Kafka message, skipping");
      return;
    }

    try {
      const parsedJson = JSON.parse(rawValue);
      const event: BookingStatusChangedV1Type =
        BookingStatusChangedV1.parse(parsedJson);

      this.logger.info(
        {
          eventId: event.eventId,
          bookingId: event.bookingId,
          status: event.currentStatus,
        },
        "Processing BOOKING_STATUS_CHANGED event",
      );

      await this.eventRouter.publish(event);
    } catch (err) {
      this.logger.error(
        { err, rawValue },
        "Failed to parse or route BOOKING_STATUS_CHANGED message",
      );
    }
  }
}
