import type { EachMessagePayload, KafkaConsumerRunner } from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { ScheduleService } from "@services";
import { KAFKA_TOPICS } from "@irctc/contracts";
import { ZodError } from "zod";

/**
 * Kafka event consumer for the schedule created topic.
 * Orchestrates schedule inventory creation when a new schedule is created.
 */
export class ScheduleCreatedConsumer {
  /**
   * Creates an instance of ScheduleCreatedConsumer.
   *
   * @param runner - The generic consumer runner executing the subscription loop.
   * @param service - Service containing business logic to process schedule created events.
   * @param logger - Logger instance.
   */
  constructor(
    private readonly runner: KafkaConsumerRunner,
    private readonly service: ScheduleService,
    private readonly logger: typeof irctcLogger,
  ) {
    this.logger = logger.child({ module: "schedule-created-consumer" });
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
      await this.service.processCreated(event);
    } catch (err) {
      const isValidationError =
        err instanceof SyntaxError || err instanceof ZodError;

      if (isValidationError) {
        this.logger.error(
          {
            err:
              err instanceof Error
                ? { message: err.message, stack: err.stack }
                : err,
            messageKey: message.key?.toString("utf8"),
          },
          "Failed to parse schedule created notification payload (non-retryable). Committing offset and discarding.",
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
          "Transient error processing schedule created notification. Rethrowing for retry.",
        );
        throw err;
      }
    } finally {
      await heartbeat();
    }
  }

  /**
   * Boots the subscriber loop on the Schedule Created Kafka topic.
   */
  async start(): Promise<void> {
    await this.runner.run(KAFKA_TOPICS.SCHEDULE_CREATED, (payload) =>
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
