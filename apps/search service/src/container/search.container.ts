import { elasticsearch, env, kafka, redis } from "@config";
import {
  createConsumer,
  KafkaConsumerRunner,
  RetryPolicies,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { IdempotencyRepository } from "@irctc/redis";
import { CONSUMER_GROUPS } from "@irctc/contracts";
import { StationSearchRepository } from "@repository";
import { SearchService, StationProjectionService } from "@services";
import { SearchController } from "@controllers";
import { StationConsumer } from "@consumers";

/**
 * ## SearchContainer
 *
 * Singleton dependency injection container wiring collaborators for search-service.
 *
 * @remarks
 * ### Responsibilities
 * - Instantiates repositories (Elasticsearch, Redis idempotency).
 * - Instantiates services (projection service, search service).
 * - Instantiates thin HTTP controllers and Kafka consumer runners.
 * - Manages lifecycle startup (`start()`) and shutdown (`disconnect()`).
 *
 * ### Storage & Infrastructure Wired
 * - **Elasticsearch**: Station search repository and index setup.
 * - **Redis**: Cache-aside store and two-phase idempotency repository.
 * - **Kafka**: Consumer runners for station created, updated, and deactivated events.
 */
export class SearchContainer {
  /**
   * Singleton instance reference.
   */
  private static instance: SearchContainer;

  public readonly stationSearchRepository: StationSearchRepository;
  public readonly searchService: SearchService;
  public readonly stationProjectionService: StationProjectionService;
  public readonly searchController: SearchController;
  public readonly stationConsumer: StationConsumer;

  /**
   * Constructs container instance and wires collaborators in dependency order.
   */
  private constructor() {
    // 1. Create Repositories (Elasticsearch station repository)
    this.stationSearchRepository = new StationSearchRepository(elasticsearch);

    // 2. Create Services (Redis idempotency, projection service, and search service)
    const idempotency = new IdempotencyRepository(
      redis,
      env.IDEMPOTENCY_PROCESSING_LEASE_SECONDS,
      env.IDEMPOTENCY_TTL_SECONDS,
      env.IDEMPOTENCY_KEYSPACE,
    );

    this.stationProjectionService = new StationProjectionService(
      this.stationSearchRepository,
      idempotency,
    );

    this.searchService = new SearchService(this.stationSearchRepository, redis);

    // 3. Create Controllers (Search HTTP controller)
    this.searchController = new SearchController(this.searchService);

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

    // 5. Create StationConsumer instance aggregating runners and projection service
    this.stationConsumer = new StationConsumer(
      createdRunner,
      updatedRunner,
      deactivatedRunner,
      this.stationProjectionService,
      logger,
    );
  }

  /**
   * Ensures Elasticsearch index readiness and starts Kafka consumer loops.
   *
   * @remarks
   * ### Responsibilities
   * - Ensures Elasticsearch `stations` index exists.
   * - Starts all three Kafka event consumer loops concurrently.
   *
   * ### Side Effects
   * - **Elasticsearch**: Checks or creates `stations` index.
   * - **Kafka**: Subscribes consumer groups to station topics.
   * @throws {Error} If index creation or consumer subscription fails.
   */
  async start(): Promise<void> {
    // 1. Ensure stations Elasticsearch index exists before starting consumer loop
    logger.info({ module: "search-container" }, "ensuring stations index");
    await this.stationSearchRepository.ensureIndex();

    // 2. Subscribe all three station Kafka consumer runners concurrently
    logger.info(
      { module: "search-container" },
      "starting station event consumers...",
    );
    await this.stationConsumer.start();

    logger.info(
      {
        module: "search-container",
        consumerGroups: [
          CONSUMER_GROUPS.SEARCH_STATION_CREATED,
          CONSUMER_GROUPS.SEARCH_STATION_UPDATED,
          CONSUMER_GROUPS.SEARCH_STATION_DEACTIVATED,
        ],
      },
      "search-service event consumer loops started successfully.",
    );
  }

  /**
   * Gracefully stops Kafka consumer loops and releases network resources.
   *
   * @remarks
   * ### Responsibilities
   * - Stops Kafka consumer runners during application shutdown.
   *
   * ### Side Effects
   * - **Kafka**: Unsubscribes consumers and releases broker connections.
   */
  async disconnect(): Promise<void> {
    // 1. Stop Kafka station consumer runners gracefully
    logger.info(
      { module: "search-container" },
      "stopping station event consumers...",
    );
    await this.stationConsumer.stop();
    logger.info(
      { module: "search-container" },
      "all event consumers shut down successfully.",
    );
  }

  /**
   * Retrieves the singleton container instance.
   *
   * @returns SearchContainer singleton instance.
   */
  static getInstance(): SearchContainer {
    // 1. Instantiates SearchContainer singleton if not already initialized
    if (!SearchContainer.instance) {
      SearchContainer.instance = new SearchContainer();
    }
    return SearchContainer.instance;
  }
}
