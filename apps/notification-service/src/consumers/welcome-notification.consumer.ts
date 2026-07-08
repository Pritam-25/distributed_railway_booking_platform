import type { KafkaConsumerRunner, EachMessagePayload } from "@irctc/kafka";
import type { WelcomeNotificationService } from "@services";
import type { logger as irctcLogger } from "@irctc/logger";
import { KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Kafka event consumer for the user logged in topic.
 * Orchestrates delivery of welcome emails to users upon authentication.
 */
export class UserLoggedInConsumer {
  /**
   * Creates an instance of UserLoggedInConsumer.
   *
   * @param runner - The generic consumer runner executing the subscription loop.
   * @param service - Service containing business logic to process welcome events.
   * @param logger - Logger instance.
   */
  constructor(
    private readonly runner: KafkaConsumerRunner,
    private readonly service: WelcomeNotificationService,
    private readonly logger: typeof irctcLogger,
  ) {}

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
      await this.service.process(event);
    } catch (err) {
      // Catch and swallow all errors (parse errors, validation failures, email send failures)
      // to commit the offset and prevent queue stalling. High priority log is written instead.
      this.logger.error(
        {
          module: "user-logged-in-consumer",
          err:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
          messageKey: message.key?.toString("utf8"),
        },
        "Failed to process user logged in welcome notification. Committing offset and discarding.",
      );
    } finally {
      await heartbeat();
    }
  }

  /**
   * Boots the subscriber loop on the User Logged In Kafka topic.
   */
  async start(): Promise<void> {
    await this.runner.run(KAFKA_TOPICS.USER_LOGGED_IN, (payload) =>
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
