import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { LoggerLike } from "./kafka-consumer-runner.js";
import { KAFKA_HEADERS } from "../headers/kafka-headers.js";
import { DLQ_REASONS } from "../headers/dlq-reasons.js";
import { isNonRetryableError } from "./error-classifier.js";

type EachMessagePayload = KafkaJS.EachMessagePayload;
type Producer = KafkaJS.Producer;

/**
 * Configuration options for Dead Letter Queue (DLQ) error routing.
 */
export interface DlqOptions {
  /** Target Kafka topic designated as the Dead Letter Queue for failed dispatches. Defaults to `<topic>.dlq` if omitted. */
  dlqTopic?: string;
  /** Maximum retry limit prior to delegating to the DLQ topic. */
  maxRetries?: number;
  /** If true (default true), only non-retryable errors (SyntaxError, ZodError) go to DLQ; retryable errors re-throw for consumer retries. */
  selective?: boolean;
  /** Optional custom error classifier predicate. */
  isCustomNonRetryable?: (err: unknown) => boolean;
}

/**
 * Wraps a standard Kafka message handler callback with Dead Letter Queue (DLQ) fallback capabilities.
 *
 * Catches unhandled exceptions thrown by `handler`. Non-retryable errors (SyntaxError, ZodError) are
 * automatically routed to `options.dlqTopic` (or `<topic>.dlq`) with metadata headers. Retryable errors are re-thrown to let
 * `KafkaConsumerRunner` / `KafkaJS` retry the message.
 *
 * @param producer - Connected {@link Producer} instance used to forward failed messages to the DLQ topic.
 * @param options - {@link DlqOptions} specifying the target DLQ topic name and routing options.
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
  const isSelective = options.selective ?? true;

  return async (payload: EachMessagePayload): Promise<void> => {
    const { topic, partition, message } = payload;
    const dlqTopic = options.dlqTopic ?? `${topic}.dlq`;

    try {
      // Execute the actual message processing logic
      await handler(payload);
    } catch (err) {
      if (
        isSelective &&
        !isNonRetryableError(err, options.isCustomNonRetryable)
      ) {
        logger.warn(
          { err, topic, partition, offset: message.offset },
          `Transient handler error on topic ${topic}. Re-throwing for consumer retry.`,
        );
        throw err;
      }

      logger.error(
        { err, topic, partition, offset: message.offset },
        `Non-retryable error on topic ${topic}. Routing to DLQ (${dlqTopic}).`,
      );

      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : "";

      try {
        // Forward the exact message body to the DLQ with metadata headers
        await producer.send({
          topic: dlqTopic,
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
          { dlqTopic, messageKey: message.key?.toString() },
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

/**
 * Interface representing any object capable of parsing raw unknown data into type T (e.g. Zod schemas).
 */
export interface SchemaLike<T> {
  parse(data: unknown): T;
}

/**
 * Higher-order factory function creating clean Kafka JSON consumer handlers with DLQ error routing.
 * Encapsulates null checks, UTF-8 buffer conversion, JSON parsing, Zod validation,
 * automatic heartbeat dispatch, and Dead Letter Queue (DLQ) error routing.
 *
 * @param producer - Connected {@link Producer} instance used to forward failed messages to the DLQ topic.
 * @param logger - Structured logger instance.
 * @param schema - Schema with a `.parse(data)` method (e.g. Zod schema).
 * @param process - Business domain logic function receiving the validated event.
 * @param dlqOptions - Optional DLQ routing config. Defaults to `<topic>.dlq`.
 */
export function createDlqConsumerHandler<T>(
  producer: Producer,
  logger: LoggerLike,
  schema: SchemaLike<T>,
  process: (event: T, payload: EachMessagePayload) => Promise<unknown>,
  dlqOptions: DlqOptions = {},
): (payload: EachMessagePayload) => Promise<void> {
  const jsonProcessor = async (payload: EachMessagePayload): Promise<void> => {
    const { message, heartbeat } = payload;
    if (message.value === null) return;

    try {
      const rawJson = JSON.parse(message.value.toString("utf8"));
      const event = schema.parse(rawJson);
      await process(event, payload);
    } finally {
      await heartbeat();
    }
  };

  return wrapWithDlq(producer, dlqOptions, logger, jsonProcessor);
}
