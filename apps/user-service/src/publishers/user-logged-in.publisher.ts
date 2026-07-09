import type { Producer } from "@irctc/kafka";
import { KAFKA_TOPICS, type UserLoggedInV1Type } from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { injectTraceContextToKafkaHeaders } from "@irctc/telemetry";

const SCHEMA_VERSION = "1" as const;

/**
 * Publishes the `user.logged-in.v1` event after a
 * successful login. The login HTTP path awaits this — but failures
 * are best-effort and the caller swallows them (see AuthService.login).
 *
 * The OTP publisher owns the same header keys; we keep both classes
 * in sync by sharing the `HEADER_*` constants. If the headers ever
 * change in one place, update both — and the @irctc/kafka package
 * mirror in the notification service.
 */
export class UserLoggedInEventPublisher {
  /**
   * Creates an instance of UserLoggedInEventPublisher.
   * @param producer - The Kafka Producer instance.
   */
  constructor(private readonly producer: Producer) {}

  /**
   * Publishes a USER_LOGGED_IN event to the Kafka topic.
   *
   * @param input - The login event payload to publish.
   * @returns A promise that resolves when the event is successfully published.
   * @throws {Error} - If the Kafka send operation fails.
   */
  async publishUserLoggedIn(input: UserLoggedInV1Type): Promise<void> {
    try {
      const headers = injectTraceContextToKafkaHeaders({
        [KAFKA_HEADERS.EVENT_ID]: input.eventId,
        [KAFKA_HEADERS.SCHEMA_VERSION]: SCHEMA_VERSION,
      });

      await this.producer.send({
        topic: KAFKA_TOPICS.USER_LOGGED_IN,
        messages: [
          {
            key: input.userId,
            value: JSON.stringify(input),
            headers,
          },
        ],
      });

      logger.info(
        {
          module: "user-logged-in-publisher",
          eventId: input.eventId,
          userId: input.userId,
        },
        "UserLoggedInV1 published",
      );
    } catch (error) {
      logger.error(
        {
          module: "user-logged-in-publisher",
          error,
          eventId: input.eventId,
          userId: input.userId,
        },
        "Failed to publish UserLoggedInV1",
      );

      throw error;
    }
  }
}
