import {
  createDlqConsumerHandler,
  type EachMessagePayload,
  type KafkaConsumerRunner,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import {
  BookingStatus,
  BookingStatusChangedV1,
  KAFKA_TOPICS,
  type BookingStatusChangedV1Type,
} from "@irctc/contracts";

import { type SeatAllocationService } from "@services";

type LoggerLike = typeof irctcLogger;

/**
 * Consumer that listens to `BOOKING_STATUS_CHANGED` events from Kafka and drives
 * `confirmSeats` or `cancelSeats` in `inventory-service`.
 */
export class BookingStatusChangedConsumer {
  /**
   * @param producer - Shared Kafka producer used by `wrapWithDlq`.
   * @param runner - KafkaConsumerRunner for the subscription loop.
   * @param service - Inventory-side business logic.
   * @param logger - Structured logger.
   */
  constructor(
    private readonly producer: Producer,
    private readonly runner: KafkaConsumerRunner,
    private readonly service: SeatAllocationService,
    private readonly logger: LoggerLike,
  ) {
    this.logger = logger.child({ module: "booking-status-changed-consumer" });
  }

  /**
   * Boots the consumer loop on the `BOOKING_STATUS_CHANGED` topic.
   *
   * @returns A promise that resolves when the subscription is active.
   */
  async start(): Promise<void> {
    await this.runner.run(
      KAFKA_TOPICS.BOOKING_STATUS_CHANGED,
      this.createHandler(),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for booking status changed events.
   */
  private createHandler(): (payload: EachMessagePayload) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      BookingStatusChangedV1,
      async (event: BookingStatusChangedV1Type) => {
        if (event.currentStatus === BookingStatus.CONFIRMED) {
          this.logger.info(
            { bookingId: event.bookingId, eventId: event.eventId },
            "Promoting HELD seats to CONFIRMED for booking",
          );
          await this.service.confirmSeats({
            eventId: event.eventId,
            bookingId: event.bookingId,
          });
        } else if (
          event.currentStatus === BookingStatus.CANCELLED ||
          event.currentStatus === BookingStatus.FAILED ||
          event.currentStatus === BookingStatus.EXPIRED
        ) {
          this.logger.info(
            {
              bookingId: event.bookingId,
              eventId: event.eventId,
              status: event.currentStatus,
            },
            "Releasing seat allocation for booking",
          );
          await this.service.cancelSeats({
            eventId: event.eventId,
            bookingId: event.bookingId,
          });
        }
      },
    );
  }

  /**
   * Stops the consumer subscription loop.
   *
   * @returns A promise that resolves when the runner has drained.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }
}
