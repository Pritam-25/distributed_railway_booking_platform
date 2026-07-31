import { KafkaJS } from "@confluentinc/kafka-javascript";
import { SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";

type Consumer = KafkaJS.Consumer;
type EachMessagePayload = KafkaJS.EachMessagePayload;
import { extractTraceContextFromKafkaHeaders } from "@irctc/telemetry";

/**
 * Minimal diagnostic logging interface.
 *
 * Encapsulates standard log levels required by {@link KafkaConsumerRunner} without creating a rigid dependency on Pino.
 */
export interface LoggerLike {
  /** Log informational messages. */
  info: (obj: Record<string, unknown>, msg: string) => void;
  /** Log non-fatal warnings. */
  warn: (obj: Record<string, unknown>, msg: string) => void;
  /** Log execution errors. */
  error: (obj: Record<string, unknown>, msg: string) => void;
  /** Log fatal unrecoverable errors. */
  fatal?: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Async message handler callback function signature.
 */
export type MessageHandler = (payload: EachMessagePayload) => Promise<void>;

/**
 * Consumer lifecycle manager for running Kafka consumer group subscription loops.
 */
export class KafkaConsumerRunner {
  /**
   * Create an instance of KafkaConsumerRunner.
   *
   * @param consumer - Managed {@link Consumer} instance.
   * @param logger - Diagnostic logger satisfying {@link LoggerLike}.
   * @param propagateTraceContext - Enables OpenTelemetry trace context extraction from incoming message headers (defaults to `true`).
   */
  constructor(
    private readonly consumer: Consumer,
    private readonly logger: LoggerLike,
    private readonly propagateTraceContext: boolean = true,
  ) {}

  /**
   * Connects the consumer, subscribes to the designated topic, and starts the message execution loop.
   *
   * For each incoming message, creates an OpenTelemetry active span (`"<topic> process"`, kind `CONSUMER`) linked to
   * parent trace headers attached to the message. Re-throws unhandled errors so parent Kafka retries or DLQ wrappers run.
   *
   * @param topic - Name of the Kafka topic to subscribe to.
   * @param handler - {@link MessageHandler} callback executing business logic for each message.
   * @returns A promise resolving once the consumer has connected and launched its run loop.
   */
  async run(topic: string, handler: MessageHandler): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic,
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
   * Gracefully disconnects the managed Kafka consumer from the broker cluster.
   *
   * @returns A promise resolving when disconnection completes.
   */
  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
