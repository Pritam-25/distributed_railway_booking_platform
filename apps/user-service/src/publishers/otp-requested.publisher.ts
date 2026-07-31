import type { Producer } from "@irctc/kafka";
import { type OTPRequestedV1Type, KAFKA_TOPICS } from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { injectTraceContextToKafkaHeaders } from "@irctc/telemetry";

const SCHEMA_VERSION = "1" as const;

/**
 * ## OtpEventPublisher
 *
 * Publishes `OTPRequestedV1` events to the user-service Kafka topic.
 *
 * @remarks
 * ### Responsibilities
 * - Serializes typed {@link OTPRequestedV1Type} payloads to JSON.
 * - Injects schema version, event ID, and trace context into Kafka headers.
 * - Logs publish success and failure outcomes.
 *
 * ### Side Effects
 * - **Kafka**: Produces a single message to `KAFKA_TOPICS.USER_OTP_REQUESTED`.
 *
 * ### Failure Guarantees
 * - Publish errors are logged and re-thrown; the caller (e.g.
 *   {@link AuthService.sendOtp}) is responsible for rolling back Redis state
 *   when the publish fails.
 */
export class OtpEventPublisher {
  /**
   * Creates an instance of OtpEventPublisher.
   *
   * @param producer - The Kafka Producer instance.
   */
  constructor(private readonly producer: Producer) {}

  /**
   * Serializes and publishes an `OTPRequestedV1` event payload to Kafka.
   *
   * @param input - Validated {@link OTPRequestedV1Type} payload.
   * @returns Resolves once the Kafka producer acknowledges the send.
   * @throws {Error} When the underlying `producer.send` operation fails.
   */
  async publishOtpRequested(input: OTPRequestedV1Type): Promise<void> {
    try {
      const headers = injectTraceContextToKafkaHeaders({
        [KAFKA_HEADERS.EVENT_ID]: input.eventId,
        [KAFKA_HEADERS.SCHEMA_VERSION]: SCHEMA_VERSION,
      });

      await this.producer.send({
        topic: KAFKA_TOPICS.USER_OTP_REQUESTED,
        messages: [
          {
            key: input.userId ?? input.eventId,
            value: JSON.stringify(input),
            headers,
          },
        ],
      });

      logger.info(
        {
          module: "otp-publisher",
          eventId: input.eventId,
          purpose: input.purpose,
        },
        "OTPRequestedV1 published",
      );
    } catch (error) {
      logger.error(
        {
          module: "otp-publisher",
          error,
          eventId: input.eventId,
          purpose: input.purpose,
        },
        "Failed to publish OTPRequestedV1",
      );

      throw error;
    }
  }
}
