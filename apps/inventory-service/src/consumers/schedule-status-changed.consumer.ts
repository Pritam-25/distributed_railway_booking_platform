import {
  createDlqConsumerHandler,
  type EachMessagePayload,
  type KafkaConsumerRunner,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { ScheduleService } from "@services";
import { KAFKA_TOPICS, ScheduleStatusChangedEventV1 } from "@irctc/contracts";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";

/**
 * Kafka event consumer for the schedule status changed topic.
 * Orchestrates schedule status updates in the inventory when a schedule's status changes.
 */
export class ScheduleStatusChangedConsumer {
  /**
   * Creates an instance of ScheduleStatusChangedConsumer.
   *
   * @param producer - Shared Kafka producer used by DLQ wrapper.
   * @param runner - The generic consumer runner executing the subscription loop.
   * @param service - Service containing business logic to process schedule status changed events.
   * @param logger - Logger instance.
   */
  constructor(
    private readonly producer: Producer,
    private readonly runner: KafkaConsumerRunner,
    private readonly service: ScheduleService,
    private readonly logger: typeof irctcLogger,
  ) {}

  /**
   * Boots the subscriber loop on the Schedule Status Changed Kafka topic.
   */
  async start(): Promise<void> {
    await this.runner.run(
      KAFKA_TOPICS.SCHEDULE_STATUS_CHANGED,
      this.createHandler(),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for schedule status changed events.
   */
  private createHandler(): (payload: EachMessagePayload) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      ScheduleStatusChangedEventV1,
      (event) => this.service.processStatusChanged(event),
      {
        isCustomNonRetryable: (e) =>
          e instanceof ApiError &&
          e.statusCode === statusCode.notFound &&
          e.code === ERROR_CODES.SCHEDULE_INVENTORY_NOT_FOUND,
      },
    );
  }

  /**
   * Stops the consumer subscription and gracefully disconnects from the broker.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }
}
