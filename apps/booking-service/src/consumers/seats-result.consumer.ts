import {
  type SeatsHeldV1Type,
  type SeatsHoldFailedV1Type,
  type SeatHoldExpiredV1Type,
  SeatsHeldV1,
  SeatsHoldFailedV1,
  SeatHoldExpiredV1,
  KAFKA_DLQ_TOPICS,
  KAFKA_TOPICS,
} from "@irctc/contracts";
import {
  KafkaConsumerRunner,
  wrapWithDlq,
  type Producer,
  type EachMessagePayload,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";

import type { BookingSagaOrchestrator } from "@services";

type LoggerLike = typeof irctcLogger;

/**
 * Kafka consumer that routes inventory-service seat-hold replies to the
 * booking-side saga orchestrator.
 *
 * ### Topics
 * - `INVENTORY_SEATS_HELD` → `orchestrator.handleSeatsHeld`
 * - `INVENTORY_SEATS_HOLD_FAILED` → `orchestrator.handleSeatsHoldFailed`
 * - `INVENTORY_SEAT_HOLD_EXPIRED` → `orchestrator.handleSeatHoldExpired`
 *
 * Each topic runs its own consumer group member via `KafkaConsumerRunner`
 * so a single crash only affects one subscription loop.
 */
export class SeatsResultConsumer {
  /**
   * @param producer - Shared Kafka producer used by `wrapWithDlq` to
   *   forward malformed messages to the per-topic DLQ.
   * @param heldRunner - Runner for `INVENTORY_SEATS_HELD`.
   * @param failedRunner - Runner for `INVENTORY_SEATS_HOLD_FAILED`.
   * @param expiredRunner - Runner for `INVENTORY_SEAT_HOLD_EXPIRED`.
   * @param orchestrator - Saga orchestrator receiving the parsed events.
   * @param logger - Structured logger.
   */
  constructor(
    private readonly producer: Producer,
    private readonly heldRunner: KafkaConsumerRunner,
    private readonly failedRunner: KafkaConsumerRunner,
    private readonly expiredRunner: KafkaConsumerRunner,
    private readonly orchestrator: BookingSagaOrchestrator,
    private readonly logger: LoggerLike,
  ) {}

  /**
   * Subscribes to all three saga-result topics and starts their consumer
   * loops.
   *
   * @returns A promise that resolves when all three subscriptions are
   *   active.
   */
  async start(): Promise<void> {
    const handleHeld = async (payload: EachMessagePayload): Promise<void> => {
      if (payload.message.value === null) return;
      const event = JSON.parse(payload.message.value.toString("utf8"));
      const parsed: SeatsHeldV1Type = SeatsHeldV1.parse(event);
      await this.orchestrator.handleSeatsHeld(parsed);
      await payload.heartbeat();
    };

    const handleFailed = async (payload: EachMessagePayload): Promise<void> => {
      if (payload.message.value === null) return;
      const event = JSON.parse(payload.message.value.toString("utf8"));
      const parsed: SeatsHoldFailedV1Type = SeatsHoldFailedV1.parse(event);
      await this.orchestrator.handleSeatsHoldFailed(parsed);
      await payload.heartbeat();
    };

    const handleExpired = async (
      payload: EachMessagePayload,
    ): Promise<void> => {
      if (payload.message.value === null) return;
      const event = JSON.parse(payload.message.value.toString("utf8"));
      const parsed: SeatHoldExpiredV1Type = SeatHoldExpiredV1.parse(event);
      await this.orchestrator.handleSeatHoldExpired(parsed);
      await payload.heartbeat();
    };

    const heldDlq = wrapWithDlq(
      this.producer,
      { dlqTopic: KAFKA_DLQ_TOPICS.INVENTORY_SEATS_HELD_DLQ },
      this.logger,
      handleHeld,
    );
    const failedDlq = wrapWithDlq(
      this.producer,
      { dlqTopic: KAFKA_DLQ_TOPICS.INVENTORY_SEATS_HOLD_FAILED_DLQ },
      this.logger,
      handleFailed,
    );
    const expiredDlq = wrapWithDlq(
      this.producer,
      { dlqTopic: KAFKA_DLQ_TOPICS.INVENTORY_SEAT_HOLD_EXPIRED_DLQ },
      this.logger,
      handleExpired,
    );

    await Promise.all([
      this.heldRunner.run(KAFKA_TOPICS.INVENTORY_SEATS_HELD, heldDlq),
      this.failedRunner.run(
        KAFKA_TOPICS.INVENTORY_SEATS_HOLD_FAILED,
        failedDlq,
      ),
      this.expiredRunner.run(
        KAFKA_TOPICS.INVENTORY_SEAT_HOLD_EXPIRED,
        expiredDlq,
      ),
    ]);
  }

  /**
   * Stops all three consumer loops.
   *
   * @returns A promise that resolves when the loops have drained.
   */
  async stop(): Promise<void> {
    await Promise.all([
      this.heldRunner.disconnect(),
      this.failedRunner.disconnect(),
      this.expiredRunner.disconnect(),
    ]);
  }
}
