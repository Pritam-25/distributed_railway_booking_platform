import type { Consumer, EachMessagePayload } from "kafkajs";
import { SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";
import { extractTraceContextFromKafkaHeaders } from "@irctc/telemetry";

/**
 * Minimal logger interface.
 *
 * Exposes the standard logging levels required by the Kafka consumer runner
 * without enforcing a direct dependency on any specific logging library (e.g., Pino).
 */
export interface LoggerLike {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Type-safe message handler callback.
 *
 * Receives the raw KafkaJS message payload. The business application is
 * responsible for parsing, validating, and handling the message.
 */
export type MessageHandler = (payload: EachMessagePayload) => Promise<void>;

/**
 * A generic runner for Kafka consumer groups.
 *
 * It manages standard lifecycle boilerplates:
 * - Establishing a connection to the broker.
 * - Subscribing to the specified topic (configured to not replay messages by default).
 * - Executing the message processing loop.
 * - Extracting and propagating OpenTelemetry distributed tracing context.
 *
 * Note that this runner is generic infrastructure and does not define a DLQ fallback policy.
 * Any unhandled exceptions remaining after KafkaJS retries are exhausted will crash the consumer,
 * relying on orchestrator restarts (e.g., Kubernetes) for retries.
 */
export class KafkaConsumerRunner {
  /**
   * Creates an instance of KafkaConsumerRunner.
   *
   * @param consumer - The active KafkaJS Consumer instance to manage.
   * @param logger - The diagnostic logger instance.
   * @param propagateTraceContext - Whether to automatically propagate OpenTelemetry trace context from message headers.
   */
  constructor(
    private readonly consumer: Consumer,
    private readonly logger: LoggerLike,
    private readonly propagateTraceContext: boolean = true,
  ) {}

  /**
   * Connects the consumer, subscribes to the designated topic, and starts the message run loop.
   *
   * @param topic - The Kafka topic to subscribe to.
   * @param handler - The message processing handler callback.
   * @returns A promise that resolves when the runner has successfully connected and started the message loop.
   */
  async run(topic: string, handler: MessageHandler): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic,
      fromBeginning: false,
    });

    this.logger.info(
      { module: "kafka-consumer-runner", topic },
      "Consumer subscribed",
    );

    await this.consumer.run({
      eachMessage: async (payload) => {
        const tracer = trace.getTracer("kafka-consumer-runner");
        const parentCtx = this.propagateTraceContext
          ? extractTraceContextFromKafkaHeaders(payload.message.headers)
          : context.active();

        await context.with(parentCtx, () =>
          tracer.startActiveSpan(
            `${payload.topic} process`,
            { kind: SpanKind.CONSUMER },
            async (span) => {
              try {
                await handler(payload);
              } catch (err) {
                span.recordException(err as Error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: err instanceof Error ? err.message : String(err),
                });
                throw err;
              } finally {
                span.end();
              }
            },
          ),
        );
      },
    });
  }

  /**
   * Gracefully disconnects the managed Kafka consumer from the broker.
   *
   * @returns A promise that resolves when the disconnection is complete.
   */
  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
