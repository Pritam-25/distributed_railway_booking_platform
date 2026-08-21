import {
  createDlqConsumerHandler,
  type EachMessagePayload,
  type KafkaConsumerRunner,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { ScheduleService } from "@services";
import { KAFKA_TOPICS, ScheduleCreatedEventV1 } from "@irctc/contracts";

/**
 * Kafka event consumer for the schedule created topic.
 * Orchestrates schedule inventory creation when a new schedule is created.
 */
export class ScheduleCreatedConsumer {
  /**
   * Creates an instance of ScheduleCreatedConsumer.
   *
   * @param producer - Shared Kafka producer used by DLQ wrapper.
   * @param runner - The generic consumer runner executing the subscription loop.
   * @param service - Service containing business logic to process schedule created events.
   * @param logger - Logger instance.
   */
  constructor(
    private readonly producer: Producer,
    private readonly runner: KafkaConsumerRunner,
    private readonly service: ScheduleService,
    private readonly logger: typeof irctcLogger,
  ) {}

  /**
   * Boots the subscriber loop on the Schedule Created Kafka topic.
   */
  async start(): Promise<void> {
    await this.runner.run(KAFKA_TOPICS.SCHEDULE_CREATED, this.createHandler());
  }

  /**
   * Creates the DLQ-wrapped message handler for schedule created events.
   */
  private createHandler(): (payload: EachMessagePayload) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      ScheduleCreatedEventV1,
      (event) => this.service.processCreated(event),
    );
  }

  /**
   * Stops the consumer subscription and gracefully disconnects from the broker.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }
}
