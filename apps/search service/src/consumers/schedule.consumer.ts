import type { EachMessagePayload, KafkaConsumerRunner } from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { z } from "zod";
import {
  KAFKA_TOPICS,
  ScheduleCreatedEventV1,
  ScheduleStatusChangedEventV1,
} from "@irctc/contracts";
import type { ScheduleProjectionService } from "@services";

type AnyScheduleEventSchema = z.ZodTypeAny;

/**
 * ## ScheduleConsumer
 *
 * Kafka consumer orchestrator handling schedule created and status-changed
 * lifecycle events for the train search projection.
 *
 * @remarks
 * ### Responsibilities
 * - Manages two Kafka consumer runners in isolated consumer groups:
 *   - `admin.schedule-created.v1` → `ScheduleProjectionService.applyCreated`
 *   - `admin.schedule-status-changed.v1` → `ScheduleProjectionService.applyStatusChange`
 * - Parses incoming JSON event payloads through versioned Zod schemas.
 * - Emits periodic consumer heartbeats to prevent rebalances.
 *
 * ### Storage & Event Infrastructure
 * - **Kafka**: Subscribes to schedule lifecycle topics via isolated consumer groups.
 * - **Elasticsearch**: `train_schedules` projection index updated via
 *   {@link ScheduleProjectionService}.
 */
export class ScheduleConsumer {
  private readonly createdRunner: KafkaConsumerRunner;
  private readonly statusRunner: KafkaConsumerRunner;
  private readonly scopedLogger: ReturnType<typeof irctcLogger.child>;

  /**
   * Creates an instance of ScheduleConsumer.
   *
   * @param createdRunner - Injected runner for `admin.schedule-created.v1`.
   * @param statusRunner - Injected runner for `admin.schedule-status-changed.v1`.
   * @param projectionService - Service owning the schedule projection pipeline.
   * @param logger - Module-level logger for the consumer scope.
   */
  constructor(
    createdRunner: KafkaConsumerRunner,
    statusRunner: KafkaConsumerRunner,
    private readonly projectionService: ScheduleProjectionService,
    logger: typeof irctcLogger,
  ) {
    this.createdRunner = createdRunner;
    this.statusRunner = statusRunner;
    this.scopedLogger = logger.child({ module: "schedule-consumer" });
  }

  /**
   * Connects Kafka consumers and starts processing message loops for
   * the schedule lifecycle topics.
   *
   * @remarks
   * ### Side Effects
   * - **Kafka**: Joins consumer groups and begins polling messages.
   *
   * ### Failure Guarantees
   * - Broker connection or subscription failures propagate to the caller.
   */
  async start(): Promise<void> {
    await Promise.all([
      this.createdRunner.run(KAFKA_TOPICS.SCHEDULE_CREATED, (payload) =>
        this.handleScheduleEvent(payload, ScheduleCreatedEventV1, (event) =>
          this.projectionService.applyCreated(event),
        ),
      ),
      this.statusRunner.run(KAFKA_TOPICS.SCHEDULE_STATUS_CHANGED, (payload) =>
        this.handleScheduleEvent(
          payload,
          ScheduleStatusChangedEventV1,
          (event) => this.projectionService.applyStatusChange(event),
        ),
      ),
    ]);
  }

  /**
   * Gracefully stops the consumer runners and disconnects from Kafka brokers.
   *
   * @remarks
   * ### Side Effects
   * - **Kafka**: Closes consumer TCP sockets and leaves consumer groups.
   */
  async stop(): Promise<void> {
    await Promise.all([
      this.createdRunner.disconnect(),
      this.statusRunner.disconnect(),
    ]);
  }

  /**
   * Parses, projects, and acknowledges a single schedule event payload.
   *
   * @remarks
   * ### Failure Guarantees
   * - Poison-pill JSON syntax errors are swallowed to prevent partition
   *   starvation; schema and projection errors propagate for retry/DLQ.
   * @param payload - Kafka message payload.
   * @param schema - Zod schema used to validate the payload.
   * @param project - Projection callback.
   */
  private async handleScheduleEvent<T extends AnyScheduleEventSchema>(
    payload: EachMessagePayload,
    schema: T,
    project: (event: z.infer<T>) => Promise<unknown>,
  ): Promise<void> {
    const { message, heartbeat } = payload;
    if (message.value === null) return;

    try {
      const eventVal = JSON.parse(message.value.toString("utf8"));
      const event = schema.parse(eventVal);
      await project(event);
    } catch (err) {
      this.scopedLogger.error(
        { err, messageKey: message.key?.toString("utf8") },
        "failed to process schedule event",
      );
      // Swallow malformed JSON SyntaxError (poison pills); rethrow others.
      if (!(err instanceof SyntaxError)) throw err;
    } finally {
      // Always send heartbeat to keep consumer group membership alive.
      await heartbeat();
    }
  }
}
