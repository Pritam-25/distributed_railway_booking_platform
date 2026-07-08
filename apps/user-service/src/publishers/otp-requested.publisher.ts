import type { Producer } from "@irctc/kafka";
import { type OTPRequestedV1Type, KAFKA_TOPICS } from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { KAFKA_HEADERS } from "@irctc/kafka";

const SCHEMA_VERSION = "1" as const;

/**
 * Publisher class responsible for producing OTP-related events to Kafka topics.
 */
export class OtpEventPublisher {
  /**
   * Creates an instance of OtpEventPublisher.
   * @param producer - The Kafka Producer instance.
   */
  constructor(private readonly producer: Producer) {}

  /**
   * Publishes a USER_OTP_REQUESTED event to the Kafka topic.
   *
   * @param input - The OTP event payload to publish.
   * @returns A promise that resolves when the event is successfully published.
   * @throws {Error} - If the Kafka send operation fails.
   */
  async publishOtpRequested(input: OTPRequestedV1Type): Promise<void> {
    try {
      await this.producer.send({
        topic: KAFKA_TOPICS.USER_OTP_REQUESTED,
        messages: [
          {
            key: input.userId ?? input.eventId,
            value: JSON.stringify(input),
            headers: {
              [KAFKA_HEADERS.EVENT_ID]: input.eventId,
              [KAFKA_HEADERS.SCHEMA_VERSION]: SCHEMA_VERSION,
            },
          },
        ],
      });

      logger.info(
        {
          module: "otp-publisher",
          eventId: input.eventId,
        },
        "OTPRequestedV1 published",
      );
    } catch (error) {
      logger.error(
        {
          module: "otp-publisher",
          error,
          eventId: input.eventId,
        },
        "Failed to publish OTPRequestedV1",
      );

      throw error;
    }
  }
}
