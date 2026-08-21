import {
  createDlqConsumerHandler,
  type EachMessagePayload,
  type KafkaConsumerRunner,
  type Producer,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import {
  KAFKA_TOPICS,
  StationCreatedEventV1,
  StationUpdatedEventV1,
  StationDeactivatedEventV1,
} from "@irctc/contracts";
import type { StationProjectionService } from "@services";

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

  /**
   * Creates an instance of StationConsumer.
   *
   * @param producer - Shared Kafka producer for writing to DLQ topics.
   * @param createdRunner - Injected runner for `admin.station-created.v1` topic.
   * @param updatedRunner - Injected runner for `admin.station-updated.v1` topic.
   * @param deactivatedRunner - Injected runner for `admin.station-deactivated.v1` topic.
   * @param projectionService - Service owning the station search projection write pipeline.
   * @param logger - Module-level logger used to construct a consumer-scoped child logger.
   */
  constructor(
    private readonly producer: Producer,
    createdRunner: KafkaConsumerRunner,
    updatedRunner: KafkaConsumerRunner,
    deactivatedRunner: KafkaConsumerRunner,
    private readonly projectionService: StationProjectionService,
    private readonly logger: typeof irctcLogger,
  ) {
    this.createdRunner = createdRunner;
    this.updatedRunner = updatedRunner;
    this.deactivatedRunner = deactivatedRunner;
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
    await Promise.all([
      this.createdRunner.run(
        KAFKA_TOPICS.STATION_CREATED,
        this.createCreatedHandler(),
      ),
      this.updatedRunner.run(
        KAFKA_TOPICS.STATION_UPDATED,
        this.createUpdatedHandler(),
      ),
      this.deactivatedRunner.run(
        KAFKA_TOPICS.STATION_DEACTIVATED,
        this.createDeactivatedHandler(),
      ),
    ]);
  }

  /**
   * Creates the DLQ-wrapped message handler for station created events.
   */
  private createCreatedHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      StationCreatedEventV1,
      (event) => this.projectionService.applyUpsert(event),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for station updated events.
   */
  private createUpdatedHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      StationUpdatedEventV1,
      (event) => this.projectionService.applyUpsert(event),
    );
  }

  /**
   * Creates the DLQ-wrapped message handler for station deactivated events.
   */
  private createDeactivatedHandler(): (
    payload: EachMessagePayload,
  ) => Promise<void> {
    return createDlqConsumerHandler(
      this.producer,
      this.logger,
      StationDeactivatedEventV1,
      (event) => this.projectionService.applyDeactivated(event),
    );
  }

  /**
   * Gracefully stops consumer runners and disconnects from Kafka brokers.
   *
   * @remarks
   * ### Side Effects
   * - **Kafka**: Closes consumer TCP socket channels and leaves consumer groups.
   */
  async stop(): Promise<void> {
    await Promise.all([
      this.createdRunner.disconnect(),
      this.updatedRunner.disconnect(),
      this.deactivatedRunner.disconnect(),
    ]);
  }
}
