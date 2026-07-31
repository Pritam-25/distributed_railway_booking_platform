import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { LoggerLike } from "./kafka-consumer-runner.js";
import { KAFKA_HEADERS } from "../headers/kafka-headers.js";
import { DLQ_REASONS } from "../headers/dlq-reasons.js";

type EachMessagePayload = KafkaJS.EachMessagePayload;
type Producer = KafkaJS.Producer;

/**
 * Configuration options for Dead Letter Queue (DLQ) error routing.
 */
export interface DlqOptions {
  /** Target Kafka topic designated as the Dead Letter Queue for failed dispatches. */
  dlqTopic: string;
  /** Maximum retry limit prior to delegating to the DLQ topic. */
  maxRetries?: number;
}

/**
 * Wraps a standard Kafka message handler callback with Dead Letter Queue (DLQ) fallback capabilities.
 *
 * Catches unhandled exceptions thrown by `handler`. On error, constructs diagnostic metadata headers and
 * publishes the message to `options.dlqTopic`. If the DLQ publish fails, re-throws to trigger container restart.
 *
 * @param producer - Connected {@link Producer} instance used to forward failed messages to the DLQ topic.
 * @param options - {@link DlqOptions} specifying the target DLQ topic name.
 * @param logger - Diagnostic logger instance satisfying {@link LoggerLike}.
 * @param handler - Core message processing callback to execute.
 * @returns An async function executing the wrapped message handler with DLQ fallback routing.
 */
export const wrapWithDlq = (
  producer: Producer,
  options: DlqOptions,
  logger: LoggerLike,
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
        const logFatal = logger.fatal ?? logger.error;
        logFatal.call(
          logger,
          { dlqErr, originalErr: err, topic, partition },
          "FATAL: Failed to write to DLQ. Consumer will crash to prevent message loss.",
        );
        // Crash consumer to let orchestrator restart it
        throw dlqErr;
      }
    }
  };
};
