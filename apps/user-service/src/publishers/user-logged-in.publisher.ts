import type { Producer } from "@irctc/kafka";
import { KAFKA_TOPICS, type UserLoggedInV1Type } from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { injectTraceContextToKafkaHeaders } from "@irctc/telemetry";

const SCHEMA_VERSION = "1" as const;

/**
 * ## UserLoggedInEventPublisher
 *
 * Publishes `UserLoggedInV1` events to the user-service Kafka topic.
 *
 * @remarks
 * ### Responsibilities
 * - Serializes typed {@link UserLoggedInV1Type} payloads to JSON.
 * - Injects schema version, event ID, and trace context into Kafka headers.
 * - Logs publish success and failure outcomes.
 *
 * ### Side Effects
 * - **Kafka**: Produces a single message to `KAFKA_TOPICS.USER_LOGGED_IN`.
 *
 * ### Failure Guarantees
 * - Publish errors are logged and re-thrown; callers (e.g.
 *   {@link AuthService.login}) treat them as best-effort and do not roll
 *   back the session.
 */
export class UserLoggedInEventPublisher {
  /**
   * Creates an instance of UserLoggedInEventPublisher.
   *
   * @param producer - The Kafka Producer instance.
   */
  constructor(private readonly producer: Producer) {}

  /**
   * Serializes and publishes a `UserLoggedInV1` event payload to Kafka.
   *
   * @param input - Validated {@link UserLoggedInV1Type} payload.
   * @returns Resolves once the Kafka producer acknowledges the send.
   * @throws {Error} When the underlying `producer.send` operation fails.
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
