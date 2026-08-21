/**
 * ## module/hold-seats-consumer
 *
 * Kafka consumer for `BOOKING_HOLD_SEATS_REQUESTED`. Drives the
 * inventory-side seat-hold critical section in
 * {@link SeatAllocationService} and writes its own outbox row
 * (`SeatsHeldV1` or `SeatsHoldFailedV1`); the consumer itself is just
 * a parser + DLQ wrapper.
 *
 * @packageDocumentation
 */

import {
  type EachMessagePayload,
  type KafkaConsumerRunner,
  type Producer,
  wrapWithDlq,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import {
  HoldSeatsRequestedV1,
  KAFKA_DLQ_TOPICS,
  KAFKA_TOPICS,
} from "@irctc/contracts";

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
    const handle = async (payload: EachMessagePayload): Promise<void> => {
      if (payload.message.value === null) return;
      const raw = JSON.parse(payload.message.value.toString("utf8"));
      const parsed = HoldSeatsRequestedV1.parse(raw);
      await this.service.holdSeats(parsed);
      await payload.heartbeat();
    };

    const dlqWrapped = wrapWithDlq(
      this.producer,
      { dlqTopic: KAFKA_DLQ_TOPICS.BOOKING_HOLD_SEATS_REQUESTED_DLQ },
      this.logger,
      handle,
    );

    await this.runner.run(
      KAFKA_TOPICS.BOOKING_HOLD_SEATS_REQUESTED,
      dlqWrapped,
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
