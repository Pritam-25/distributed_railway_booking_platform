import {
  SeatsHeldV1,
  SeatsHoldFailedV1,
  SeatHoldExpiredV1,
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
    await Promise.all([
      this.heldRunner.run(
        KAFKA_TOPICS.INVENTORY_SEATS_HELD,
        this.createHeldHandler(),
      ),
      this.failedRunner.run(
        KAFKA_TOPICS.INVENTORY_SEATS_HOLD_FAILED,
        this.createFailedHandler(),
      ),
      this.expiredRunner.run(
        KAFKA_TOPICS.INVENTORY_SEAT_HOLD_EXPIRED,
        this.createExpiredHandler(),
      ),
    ]);
  }

  /**
   * Creates the DLQ-wrapped message handler for INVENTORY_SEATS_HELD events.
   */
  private createHeldHandler(): (payload: EachMessagePayload) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      SeatsHeldV1,
      (event) => this.orchestrator.handleSeatsHeld(event),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for INVENTORY_SEATS_HOLD_FAILED events.
   */
  private createFailedHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      SeatsHoldFailedV1,
      (event) => this.orchestrator.handleSeatsHoldFailed(event),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for INVENTORY_SEAT_HOLD_EXPIRED events.
   */
  private createExpiredHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      SeatHoldExpiredV1,
      (event) => this.orchestrator.handleSeatHoldExpired(event),
    );
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
