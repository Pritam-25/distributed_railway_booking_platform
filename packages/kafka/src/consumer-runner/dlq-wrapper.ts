import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { logger as irctcLogger } from "@irctc/logger";

type EachMessagePayload = KafkaJS.EachMessagePayload;
type Producer = KafkaJS.Producer;
import { KAFKA_HEADERS } from "../headers/kafka-headers.js";
import { DLQ_REASONS } from "../headers/dlq-reasons.js";

/**
 * Configuration options for routing failed messages to a Dead Letter Queue (DLQ).
 * @property dlqTopic - The kafka topic name designated as the Dead Letter Queue
 * @property maxRetries - The maximum number of retry attempts before routing to the DLQ
 */
export interface DlqOptions {
  dlqTopic: string;
  maxRetries?: number;
}

/**
 * Wraps a standard Kafka message handler with Dead Letter Queue (DLQ) routing capabilities.
 *
 * If the provided `handler` throws an exception, this wrapper catches it, constructs diagnostic
 * metadata (original topic, partition, error message, stack trace, timestamp, and routing reason),
 * attaches it to the original message headers, and forwards the message to the DLQ topic.
 *
 * If routing to the DLQ itself fails, a fatal error is logged and the error is rethrown.
 * This crashes the consumer to avoid silent message loss and trigger standard container restarts.
 *
 * @param producer - The Kafka producer instance used to publish messages to the DLQ.
 * @param options - Configuration options specifying the DLQ topic name.
 * @param logger - The application logger instance.
 * @param handler - The target message processing function.
 * @returns A wrapped message handler function with built-in DLQ fallback logic.
 */
export const wrapWithDlq = (
  producer: Producer,
  options: DlqOptions,
  logger: typeof irctcLogger,
  handler: (payload: EachMessagePayload) => Promise<void>,
) => {
  return async (payload: EachMessagePayload): Promise<void> => {
    const { topic, partition, message } = payload;

    try {
      // Execute the actual message processing logic
      await handler(payload);
    } catch (err) {
      logger.error(
        { err, topic, partition, offset: message.offset },
        `Failed to process message on topic ${topic}. Routing to DLQ.`,
      );

      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : "";

      try {
        // Forward the exact message body to the DLQ with metadata headers
        await producer.send({
          topic: options.dlqTopic,
          messages: [
            {
              key: message.key,
              value: message.value,
              headers: {
                ...message.headers,
                [KAFKA_HEADERS.ORIGINAL_TOPIC]: topic,
                [KAFKA_HEADERS.ORIGINAL_PARTITION]: String(partition),
                [KAFKA_HEADERS.DLQ_TIMESTAMP]: new Date().toISOString(),
                [KAFKA_HEADERS.DLQ_REASON]: DLQ_REASONS.RETRY_EXHAUSTED,
                [KAFKA_HEADERS.DLQ_ERROR_MESSAGE]: errorMessage,
                [KAFKA_HEADERS.DLQ_ERROR_STACK]: errorStack
                  ? errorStack.slice(0, 1000)
                  : "",
              },
            },
          ],
        });

        logger.info(
          { dlqTopic: options.dlqTopic, messageKey: message.key?.toString() },
          "Message successfully routed to DLQ.",
        );
      } catch (dlqErr) {
        // Critical system failure: Can't process message AND can't write to DLQ
        logger.fatal(
          { dlqErr, originalErr: err, topic, partition },
          "FATAL: Failed to write to DLQ. Consumer will crash to prevent message loss.",
        );
        // Crash consumer to let orchestrator restart it
        throw dlqErr;
      }
    }
  };
};
