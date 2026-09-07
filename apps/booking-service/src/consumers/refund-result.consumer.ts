import {
  PaymentRefundedV1,
  type PaymentRefundedV1Type,
  KAFKA_TOPICS,
} from "@irctc/contracts";
import {
  createDlqConsumerHandler,
  KafkaConsumerRunner,
  type EachMessagePayload,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";

import type { BookingSagaOrchestrator } from "@services";

type LoggerLike = typeof irctcLogger;

/**
 * Kafka consumer that routes payment-service refund events to the
 * booking-side saga orchestrator.
 *
 * ### Topics
 * - `PAYMENT_REFUNDED` → `orchestrator.handlePaymentRefunded`
 */
export class RefundResultConsumer {
  /**
   * @param producer - Shared Kafka producer used by `wrapWithDlq`.
   * @param runner - Runner for `PAYMENT_REFUNDED`.
   * @param orchestrator - Saga orchestrator receiving the parsed events.
   * @param logger - Structured logger.
   */
  constructor(
    private readonly producer: Producer,
    private readonly runner: KafkaConsumerRunner,
    private readonly orchestrator: BookingSagaOrchestrator,
    private readonly logger: LoggerLike,
  ) {}

  /**
   * Subscribes to the PAYMENT_REFUNDED topic and starts the consumer loop.
   *
   * @returns A promise that resolves when the subscription is active.
   */
  async start(): Promise<void> {
    await this.runner.run(
      KAFKA_TOPICS.PAYMENT_REFUNDED,
      this.createPaymentRefundedHandler(),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for PAYMENT_REFUNDED events.
   */
  private createPaymentRefundedHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      PaymentRefundedV1,
      (event: PaymentRefundedV1Type) =>
        this.orchestrator.handlePaymentRefunded(event),
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
