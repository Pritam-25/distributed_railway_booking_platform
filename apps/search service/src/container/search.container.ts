import { elasticsearch, env, kafka, redis } from "@config";
import {
  createConsumer,
  KafkaConsumerRunner,
  RetryPolicies,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { IdempotencyRepository } from "@irctc/redis";
import { CONSUMER_GROUPS } from "@irctc/contracts";
import { StationSearchRepository, TrainSearchRepository } from "@repository";
import {
  StationSearchService,
  StationProjectionService,
  ScheduleProjectionService,
  TrainSearchService,
} from "@services";
import { SearchController } from "@controllers";
import { StationConsumer, ScheduleConsumer } from "@consumers";

/**
 * ## SearchContainer
 *
 * Singleton dependency injection container wiring collaborators for search-service.
 *
 * @remarks
 * ### Responsibilities
 * - Instantiates Elasticsearch and Redis-backed repositories.
 * - Instantiates services (projection services + read services).
 * - Instantiates thin HTTP controllers and Kafka consumer runners.
 * - Manages lifecycle startup (`start()`) and shutdown (`disconnect()`).
 *
 * ### Storage & Infrastructure Wired
 * - **Elasticsearch**: Station and train-schedule search repositories and indices.
 * - **Redis**: Cache-aside store and two-phase idempotency repositories.
 * - **Kafka**: Consumer runners for station and schedule lifecycle events.
 */
export class SearchContainer {
  /**
   * Singleton instance reference.
   */
  private static instance: SearchContainer;

  public readonly stationSearchRepository: StationSearchRepository;
  public readonly trainSearchRepository: TrainSearchRepository;
  public readonly stationSearchService: StationSearchService;
  public readonly trainSearchService: TrainSearchService;
  public readonly stationProjectionService: StationProjectionService;
  public readonly scheduleProjectionService: ScheduleProjectionService;
  public readonly searchController: SearchController;
  public readonly stationConsumer: StationConsumer;
  public readonly scheduleConsumer: ScheduleConsumer;

  /**
   * Constructs container instance and wires collaborators in dependency order.
   */
  private constructor() {
    // 1. Create Repositories (Elasticsearch)
    this.stationSearchRepository = new StationSearchRepository(elasticsearch);
    this.trainSearchRepository = new TrainSearchRepository(elasticsearch);

    // 2. Create Services (Redis idempotency, projection services, read services)
    const stationIdempotency = new IdempotencyRepository(
      redis,
      env.IDEMPOTENCY_PROCESSING_LEASE_SECONDS,
      env.IDEMPOTENCY_TTL_SECONDS,
      env.IDEMPOTENCY_KEYSPACE,
    );
    const scheduleIdempotency = new IdempotencyRepository(
      redis,
      env.IDEMPOTENCY_PROCESSING_LEASE_SECONDS,
      env.IDEMPOTENCY_TTL_SECONDS,
      env.IDEMPOTENCY_KEYSPACE_SCHEDULE,
    );

    this.stationProjectionService = new StationProjectionService(
      this.stationSearchRepository,
      stationIdempotency,
    );
    this.scheduleProjectionService = new ScheduleProjectionService(
      this.trainSearchRepository,
      scheduleIdempotency,
    );

    this.stationSearchService = new StationSearchService(
      this.stationSearchRepository,
      redis,
    );
    this.trainSearchService = new TrainSearchService(
      this.trainSearchRepository,
      this.stationSearchRepository,
      redis,
    );

    // 3. Create Controllers (Search HTTP controller)
    this.searchController = new SearchController(
      this.stationSearchService,
      this.trainSearchService,
    );

    // 4. Create Kafka Consumers and Consumer Runners
    const retryPolicy = RetryPolicies.aggressive();

    const createdKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.SEARCH_STATION_CREATED,
      retryPolicy,
    );
    const updatedKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.SEARCH_STATION_UPDATED,
      retryPolicy,
    );
    const deactivatedKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.SEARCH_STATION_DEACTIVATED,
      retryPolicy,
    );

    const createdRunner = new KafkaConsumerRunner(createdKafkaConsumer, logger);
    const updatedRunner = new KafkaConsumerRunner(updatedKafkaConsumer, logger);
    const deactivatedRunner = new KafkaConsumerRunner(
      deactivatedKafkaConsumer,
      logger,
    );

    const scheduleCreatedKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.SEARCH_SCHEDULE_CREATED,
      retryPolicy,
    );
    const scheduleStatusKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.SEARCH_SCHEDULE_STATUS_CHANGED,
      retryPolicy,
    );

    const scheduleCreatedRunner = new KafkaConsumerRunner(
      scheduleCreatedKafkaConsumer,
      logger,
    );
    const scheduleStatusRunner = new KafkaConsumerRunner(
      scheduleStatusKafkaConsumer,
      logger,
    );

    // 5. Wire consumer orchestrators
    this.stationConsumer = new StationConsumer(
      createdRunner,
      updatedRunner,
      deactivatedRunner,
      this.stationProjectionService,
      logger,
    );

    this.scheduleConsumer = new ScheduleConsumer(
      scheduleCreatedRunner,
      scheduleStatusRunner,
      this.scheduleProjectionService,
      logger,
    );

    logger.info({ module: "search-container" }, "Dependencies wired.");
  }

  /**
   * Ensures Elasticsearch indices are ready and starts Kafka consumer loops.
   *
   * @remarks
   * ### Side Effects
   * - **Elasticsearch**: Checks or creates `stations` and `train_schedules` indices.
   * - **Kafka**: Subscribes all consumer groups to their topics.
   * @throws {Error} If index creation or consumer subscription fails.
   */
  async start(): Promise<void> {
    // ensure stationIndex present.
    await this.stationSearchRepository.ensureIndex();

    // ensure trainIndex present.
    await this.trainSearchRepository.ensureIndex();

    logger.info(
      { module: "search-container" },
      "starting station event consumers...",
    );
    await this.stationConsumer.start();

    logger.info(
      { module: "search-container" },
      "starting schedule event consumers...",
    );
    await this.scheduleConsumer.start();

    logger.info(
      {
        module: "search-container",
        consumerGroups: [
          CONSUMER_GROUPS.SEARCH_STATION_CREATED,
          CONSUMER_GROUPS.SEARCH_STATION_UPDATED,
          CONSUMER_GROUPS.SEARCH_STATION_DEACTIVATED,
          CONSUMER_GROUPS.SEARCH_SCHEDULE_CREATED,
          CONSUMER_GROUPS.SEARCH_SCHEDULE_STATUS_CHANGED,
        ],
      },
      "search-service event consumer loops started successfully.",
    );
  }

  /**
   * Gracefully stops Kafka consumer loops and releases network resources.
   *
   * @remarks
   * ### Side Effects
   * - **Kafka**: Unsubscribes consumers and releases broker connections.
   */
  async disconnect(): Promise<void> {
    logger.info(
      { module: "search-container" },
      "stopping schedule and station event consumers...",
    );

    const results = await Promise.allSettled([
      this.scheduleConsumer.stop(),
      this.stationConsumer.stop(),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        logger.error(
          { module: "search-container", err: result.reason },
          "consumer shutdown failed",
        );
      }
    }

    logger.info(
      { module: "search-container" },
      "all event consumers shut down completed.",
    );
  }

  /**
   * Retrieves the singleton container instance.
   *
   * @returns SearchContainer singleton instance.
   */
  static getInstance(): SearchContainer {
    if (!SearchContainer.instance) {
      SearchContainer.instance = new SearchContainer();
    }
    return SearchContainer.instance;
  }
}
