import {
  paymentSuccessV1Schema,
  type PaymentSuccessV1,
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
 * Kafka consumer that routes payment-service success events to the
 * booking-side saga orchestrator.
 *
 * ### Topics
 * - `PAYMENT_SUCCESS` → `orchestrator.handlePaymentSuccess`
 */
export class PaymentResultConsumer {
  /**
   * @param producer - Shared Kafka producer used by `wrapWithDlq`.
   * @param runner - Runner for `PAYMENT_SUCCESS`.
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
   * Subscribes to the PAYMENT_SUCCESS topic and starts the consumer loop.
   *
   * @returns A promise that resolves when the subscription is active.
   */
  async start(): Promise<void> {
    await this.runner.run(
      KAFKA_TOPICS.PAYMENT_SUCCESS,
      this.createPaymentSuccessHandler(),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for PAYMENT_SUCCESS events.
   */
  private createPaymentSuccessHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      paymentSuccessV1Schema,
      (event: PaymentSuccessV1) =>
        this.orchestrator.handlePaymentSuccess(event),
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
