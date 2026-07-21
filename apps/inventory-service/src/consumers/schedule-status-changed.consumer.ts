import type { EachMessagePayload, KafkaConsumerRunner } from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { ScheduleService } from "@services";
import { KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Kafka event consumer for the schedule status changed topic.
 * Orchestrates schedule status updates in the inventory when a schedule's status changes.
 */
export class ScheduleStatusChangedConsumer {
  /**
   * Creates an instance of ScheduleStatusChangedConsumer.
   *
   * @param runner - The generic consumer runner executing the subscription loop.
   * @param service - Service containing business logic to process schedule status changed events.
   * @param logger - Logger instance.
   */
  constructor(
    private readonly runner: KafkaConsumerRunner,
    private readonly service: ScheduleService,
    private readonly logger: typeof irctcLogger,
  ) {
    this.logger = logger.child({ module: "schedule-status-changed-consumer" });
  }

  /**
   * Evaluates the raw incoming event payload, catches any operational issues
   * to ensure offset progression, and executes the business logic.
   *
   * @param payload - Raw Kafka broker payload context.
   */
  private async handle(payload: EachMessagePayload): Promise<void> {
    const { message, heartbeat } = payload;

    if (message.value === null) return;

    try {
      const event = JSON.parse(message.value.toString("utf8"));
      await this.service.processStatusChanged(event);
    } catch (err) {
      const isParseError = err instanceof SyntaxError;

      if (isParseError) {
        this.logger.error(
          {
            err:
              err instanceof Error
                ? { message: err.message, stack: err.stack }
                : err,
            messageKey: message.key?.toString("utf8"),
          },
          "Failed to parse schedule status changed notification payload (non-retryable). Committing offset and discarding.",
        );
      } else {
        this.logger.error(
          {
            err:
              err instanceof Error
                ? { message: err.message, stack: err.stack }
                : err,
            messageKey: message.key?.toString("utf8"),
          },
          "Transient error processing schedule status changed notification. Rethrowing for retry.",
        );
        throw err;
      }
    } finally {
      await heartbeat();
    }
  }

  /**
   * Boots the subscriber loop on the Schedule Status Changed Kafka topic.
   */
  async start(): Promise<void> {
    await this.runner.run(KAFKA_TOPICS.SCHEDULE_STATUS_CHANGED, (payload) =>
      this.handle(payload),
    );
  }

  /**
   * Stops the consumer subscription and gracefully disconnects from the broker.
   */
  async stop(): Promise<void> {
    await this.runner.disconnect();
  }
}
