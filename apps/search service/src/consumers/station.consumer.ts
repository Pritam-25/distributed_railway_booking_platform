import type { EachMessagePayload, KafkaConsumerRunner } from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { z } from "zod";
import {
  KAFKA_TOPICS,
  StationCreatedEventV1,
  StationUpdatedEventV1,
  StationDeactivatedEventV1,
} from "@irctc/contracts";
import type { StationProjectionService } from "@services";

type AnyStationEventSchema = z.ZodTypeAny;

/**
 * ## StationConsumer
 *
 * Kafka consumer orchestrator handling station created, updated, and deactivated lifecycle events.
 *
 * @remarks
 * ### Responsibilities
 * - Manages independent Kafka consumer runners for three station lifecycle topics:
 *   - `admin.station-created.v1`
 *   - `admin.station-updated.v1`
 *   - `admin.station-deactivated.v1`
 * - Parses incoming JSON event payloads through versioned Zod schemas.
 * - Delegates domain projection execution to {@link StationProjectionService}.
 * - Emits periodic consumer heartbeats to prevent Kafka consumer group rebalances.
 *
 * ### Storage & Event Infrastructure
 * - **Kafka**: Subscribes to station lifecycle topics using isolated consumer groups.
 * - **Elasticsearch**: Target search projection index updated via {@link StationProjectionService}.
 */
export class StationConsumer {
  private readonly createdRunner: KafkaConsumerRunner;
  private readonly updatedRunner: KafkaConsumerRunner;
  private readonly deactivatedRunner: KafkaConsumerRunner;
  private readonly scopedLogger: ReturnType<typeof irctcLogger.child>;

  /**
   * Creates an instance of StationConsumer.
   *
   * @param createdRunner - Injected runner for `admin.station-created.v1` topic.
   * @param updatedRunner - Injected runner for `admin.station-updated.v1` topic.
   * @param deactivatedRunner - Injected runner for `admin.station-deactivated.v1` topic.
   * @param projectionService - Service owning the station search projection write pipeline.
   * @param logger - Module-level logger used to construct a consumer-scoped child logger.
   */
  constructor(
    createdRunner: KafkaConsumerRunner,
    updatedRunner: KafkaConsumerRunner,
    deactivatedRunner: KafkaConsumerRunner,
    private readonly projectionService: StationProjectionService,
    logger: typeof irctcLogger,
  ) {
    this.createdRunner = createdRunner;
    this.updatedRunner = updatedRunner;
    this.deactivatedRunner = deactivatedRunner;
    this.scopedLogger = logger.child({ module: "station-consumer" });
  }

  /**
   * Connects Kafka consumers and starts processing message loops for station lifecycle topics.
   *
   * @remarks
   * ### Responsibilities
   * - Starts three consumer runners in parallel via {@link Promise.all}.
   * - Registers per-topic message handlers (`StationCreatedEventV1`, `StationUpdatedEventV1`, `StationDeactivatedEventV1`).
   *
   * ### Side Effects
   * - **Kafka**: Connects consumer sockets and joins consumer groups.
   *
   * ### Failure Guarantees
   * - Broker connection failures or topic subscription errors propagate to the caller.
   */
  async start(): Promise<void> {
    // 1. Subscribe and start created, updated, and deactivated station event consumer runners concurrently
    await Promise.all([
      this.createdRunner.run(KAFKA_TOPICS.STATION_CREATED, (payload) =>
        this.handleStationEvent(payload, StationCreatedEventV1, (event) =>
          this.projectionService.applyUpsert(event),
        ),
      ),
      this.updatedRunner.run(KAFKA_TOPICS.STATION_UPDATED, (payload) =>
        this.handleStationEvent(payload, StationUpdatedEventV1, (event) =>
          this.projectionService.applyUpsert(event),
        ),
      ),
      this.deactivatedRunner.run(KAFKA_TOPICS.STATION_DEACTIVATED, (payload) =>
        this.handleStationEvent(payload, StationDeactivatedEventV1, (event) =>
          this.projectionService.applyDeactivated(event),
        ),
      ),
    ]);
  }

  /**
   * Gracefully stops consumer runners and disconnects from Kafka brokers.
   *
   * @remarks
   * ### Side Effects
   * - **Kafka**: Closes consumer TCP socket channels and leaves consumer groups.
   */
  async stop(): Promise<void> {
    // 1. Disconnect all three consumer runners concurrently
    await Promise.all([
      this.createdRunner.disconnect(),
      this.updatedRunner.disconnect(),
      this.deactivatedRunner.disconnect(),
    ]);
  }

  /**
   * Parses, projects, and acknowledges a single station event payload.
   *
   * @remarks
   * ### Responsibilities
   * - Parses raw message buffer into JSON and validates against Zod schema.
   * - Invokes target projection callback.
   * - Emits Kafka heartbeat signal in `finally` block to maintain group membership.
   *
   * ### Failure Guarantees
   * - Poison-pill payloads (malformed JSON syntax errors) are logged non-fatally and swallowed to prevent partition starvation.
   * - Projection and network failures are rethrown for runner retry policies.
   * @param payload - Kafka message payload containing raw value buffer and heartbeat function.
   * @param schema - Zod schema used to validate and type the event payload.
   * @param project - Projection callback function executing Elasticsearch updates.
   */
  private async handleStationEvent<T extends AnyStationEventSchema>(
    payload: EachMessagePayload,
    schema: T,
    project: (event: z.infer<T>) => Promise<unknown>,
  ): Promise<void> {
    const { message, heartbeat } = payload;
    if (message.value === null) return;

    try {
      // 1. Parse raw message buffer into JSON and validate against versioned Zod event schema
      const eventVal = JSON.parse(message.value.toString("utf8"));
      const event = schema.parse(eventVal);

      // 2. Delegate projection write execution to StationProjectionService
      await project(event);
    } catch (err) {
      this.scopedLogger.error(
        { err, messageKey: message.key?.toString("utf8") },
        "failed to process station event",
      );
      // 3. Swallow malformed JSON SyntaxError (poison pills); rethrow all other errors for retry/DLQ
      if (!(err instanceof SyntaxError)) throw err;
    } finally {
      // 4. Send Kafka heartbeat signal to prevent consumer group rebalance
      await heartbeat();
    }
  }
}
