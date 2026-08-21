import {
  createDlqConsumerHandler,
  type EachMessagePayload,
  type KafkaConsumerRunner,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import {
  KAFKA_TOPICS,
  ScheduleCreatedEventV1,
  ScheduleStatusChangedEventV1,
} from "@irctc/contracts";
import type { ScheduleProjectionService } from "@services";

/**
 * ## ScheduleConsumer
 *
 * Kafka consumer orchestrator handling schedule created and status-changed
 * lifecycle events for the train search projection.
 *
 * @remarks
 * ### Responsibilities
 * - Manages two Kafka consumer runners in isolated consumer groups:
 *   - `admin.schedule-created.v1` → `ScheduleProjectionService.applyCreated`
 *   - `admin.schedule-status-changed.v1` → `ScheduleProjectionService.applyStatusChange`
 * - Parses incoming JSON event payloads through versioned Zod schemas.
 * - Emits periodic consumer heartbeats to prevent rebalances.
 *
 * ### Storage & Event Infrastructure
 * - **Kafka**: Subscribes to schedule lifecycle topics via isolated consumer groups.
 * - **Elasticsearch**: `train_schedules` projection index updated via
 *   {@link ScheduleProjectionService}.
 */
export class ScheduleConsumer {
  private readonly createdRunner: KafkaConsumerRunner;
  private readonly statusRunner: KafkaConsumerRunner;

  /**
   * Creates an instance of ScheduleConsumer.
   *
   * @param producer - Shared Kafka producer for writing to DLQ topics.
   * @param createdRunner - Injected runner for `admin.schedule-created.v1`.
   * @param statusRunner - Injected runner for `admin.schedule-status-changed.v1`.
   * @param projectionService - Service owning the schedule projection pipeline.
   * @param logger - Module-level logger for the consumer scope.
   */
  constructor(
    private readonly producer: Producer,
    createdRunner: KafkaConsumerRunner,
    statusRunner: KafkaConsumerRunner,
    private readonly projectionService: ScheduleProjectionService,
    private readonly logger: typeof irctcLogger,
  ) {
    this.createdRunner = createdRunner;
    this.statusRunner = statusRunner;
  }

  /**
   * Connects Kafka consumers and starts processing message loops for
   * the schedule lifecycle topics.
   *
   * @remarks
   * ### Side Effects
   * - **Kafka**: Joins consumer groups and begins polling messages.
   *
   * ### Failure Guarantees
   * - Broker connection or subscription failures propagate to the caller.
   */
  async start(): Promise<void> {
    await Promise.all([
      this.createdRunner.run(
        KAFKA_TOPICS.SCHEDULE_CREATED,
        this.createCreatedHandler(),
      ),
      this.statusRunner.run(
        KAFKA_TOPICS.SCHEDULE_STATUS_CHANGED,
        this.createStatusHandler(),
      ),
    ]);
  }

  /**
   * Creates the DLQ-wrapped message handler for schedule created events.
   */
  private createCreatedHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      ScheduleCreatedEventV1,
      (event) => this.projectionService.applyCreated(event),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for schedule status changed events.
   */
  private createStatusHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      ScheduleStatusChangedEventV1,
      (event) => this.projectionService.applyStatusChange(event),
    );
  }

  /**
   * Gracefully stops the consumer runners and disconnects from Kafka brokers.
   *
   * @remarks
   * ### Side Effects
   * - **Kafka**: Closes consumer TCP sockets and leaves consumer groups.
   */
  async stop(): Promise<void> {
    await Promise.all([
      this.createdRunner.disconnect(),
      this.statusRunner.disconnect(),
    ]);
  }
}
