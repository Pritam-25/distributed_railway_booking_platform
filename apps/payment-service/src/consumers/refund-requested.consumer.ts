import {
  BookingRefundRequestedV1,
  type BookingRefundRequestedV1Type,
  KAFKA_TOPICS,
} from "@irctc/contracts";
import {
  createDlqConsumerHandler,
  KafkaConsumerRunner,
  type EachMessagePayload,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";

import type { PaymentRefundService } from "@services";

type LoggerLike = typeof irctcLogger;

/**
 * Kafka consumer that handles booking-service refund requests.
 * Routes `BookingRefundRequestedV1` events to `PaymentRefundService.refundPayment()`.
 *
 * ### Topics
 * - `BOOKING_REFUND_REQUESTED` (`booking.refund-requested.v1`)
 */
export class RefundRequestedConsumer {
  /**
   * @param producer - Shared Kafka producer used by `wrapWithDlq`.
   * @param runner - Runner for `BOOKING_REFUND_REQUESTED`.
   * @param refundService - Payment refund service receiving the parsed events.
   * @param logger - Structured logger.
   */
  constructor(
    private readonly producer: Producer,
    private readonly runner: KafkaConsumerRunner,
    private readonly refundService: PaymentRefundService,
    private readonly logger: LoggerLike,
  ) {}

  /**
   * Subscribes to the BOOKING_REFUND_REQUESTED topic and starts the consumer loop.
   *
   * @returns A promise that resolves when the subscription is active.
   */
  async start(): Promise<void> {
    await this.runner.run(
      KAFKA_TOPICS.BOOKING_REFUND_REQUESTED,
      this.createRefundRequestedHandler(),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for BOOKING_REFUND_REQUESTED events.
   */
  private createRefundRequestedHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      BookingRefundRequestedV1,
      (event: BookingRefundRequestedV1Type) =>
        this.refundService.refundPayment(event),
    );
  }

  /**
   * Stops the consumer loop.
   *
   * @returns A promise that resolves when the loop has drained.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }
}
