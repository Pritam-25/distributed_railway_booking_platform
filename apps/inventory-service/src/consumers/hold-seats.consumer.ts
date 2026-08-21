import {
  createDlqConsumerHandler,
  type EachMessagePayload,
  type KafkaConsumerRunner,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import { HoldSeatsRequestedV1, KAFKA_TOPICS } from "@irctc/contracts";

import { type SeatAllocationService } from "@services";

type LoggerLike = typeof irctcLogger;

/**
 * Consumer that drives {@link SeatAllocationService.holdSeats} on every
 * `BOOKING_HOLD_SEATS_REQUESTED` message.
 *
 * ### DLQ
 * Unparseable payloads and unrecoverable handler errors are forwarded
 * to `BOOKING_HOLD_SEATS_REQUESTED_DLQ` via `wrapWithDlq`. Terminal
 * business failures (a held-failure outbox row) do NOT DLQ — the
 * booking-side orchestrator transitions the booking to `FAILED`.
 *
 * ### Idempotency
 * The booking-side saga idempotency layer (`BookingSagaOrchestrator`)
 * catches duplicate replies, so this consumer does not need its own
 * idempotency key store. Kafka offset commit happens only after the
 * service's transaction completes, so a crash mid-handler results in a
 * replay rather than a skip.
 */
export class HoldSeatsConsumer {
  /**
   * @param producer - Shared Kafka producer used by `wrapWithDlq` to
   *   forward malformed messages to the per-topic DLQ.
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
    this.logger = logger.child({ module: "hold-seats-consumer" });
  }

  /**
   * Boots the consumer loop on the `BOOKING_HOLD_SEATS_REQUESTED` topic.
   *
   * @returns A promise that resolves when the subscription is active.
   */
  async start(): Promise<void> {
    await this.runner.run(
      KAFKA_TOPICS.BOOKING_HOLD_SEATS_REQUESTED,
      this.createHandler(),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for hold seats requests.
   */
  private createHandler(): (payload: EachMessagePayload) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      HoldSeatsRequestedV1,
      (event) => this.service.holdSeats(event),
    );
  }

  /**
   * Stops the consumer subscription and gracefully disconnects from
   * the broker.
   *
   * @returns A promise that resolves when the runner has drained.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }
}
