import { kafka, prisma } from "@config";
import {
  createConsumer,
  KafkaConsumerRunner,
  PostgresOutboxRepository,
  RetryPolicies,
  type OutboxRepository,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";
import {
  RouteStopRepository,
  ScheduleInventoryRepository,
  SeatInventoryRepository,
} from "@repository";
import { ScheduleService } from "@services";
import { CONSUMER_GROUPS } from "@irctc/contracts";
import {
  ScheduleCreatedConsumer,
  ScheduleStatusChangedConsumer,
} from "@consumers";

/**
 * Dependency injection container for inventory-service.
 * Wires repositories, services, and consumers.
 * Singleton pattern ensures shared state across the service.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() has completed
 * (server.ts guarantees this via dynamic import of container).
 */
export class InventoryContainer {
  /**
   * Singleton instance of the InventoryContainer.
   */
  private static instance: InventoryContainer;

  /**
   * Outbox repository instance.
   */
  public readonly outboxRepository: OutboxRepository;

  /**
   * Kafka consumers
   * 1. Schedule created
   * 2. Schedule status changed
   */
  private readonly scheduleCreatedConsumer: ScheduleCreatedConsumer;
  private readonly scheduleStatusChangedConsumer: ScheduleStatusChangedConsumer;

  private constructor() {
    // 1. Repositories
    this.outboxRepository = new PostgresOutboxRepository(prisma);

    const scheduleInventoryRepo = new ScheduleInventoryRepository(prisma);
    const routeStopRepo = new RouteStopRepository(prisma);
    const seatInventoryRepo = new SeatInventoryRepository(prisma);

    // 2. Services
    const scheduleService = new ScheduleService(
      prisma,
      scheduleInventoryRepo,
      routeStopRepo,
      seatInventoryRepo,
      this.outboxRepository,
    );

    // 3. Configure consumer retry policy
    const retryPolicy = RetryPolicies.conservative();

    // 4. Initialize the Kafka consumers
    const scheduleCreatedKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.INVENTORY_SCHEDULE_CREATED,
      retryPolicy,
    );

    const scheduleStatusChangedKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.INVENTORY_SCHEDULE_STATUS_CHANGED,
      retryPolicy,
    );

    // 5. Wrap Kafka consumers in runners
    const scheduleCreatedRunner = new KafkaConsumerRunner(
      scheduleCreatedKafkaConsumer,
      logger,
    );

    const scheduleStatusChangedRunner = new KafkaConsumerRunner(
      scheduleStatusChangedKafkaConsumer,
      logger,
    );

    // 6. Instantiate the high-level event consumers to execute business logic
    this.scheduleCreatedConsumer = new ScheduleCreatedConsumer(
      scheduleCreatedRunner,
      scheduleService,
      logger,
    );

    this.scheduleStatusChangedConsumer = new ScheduleStatusChangedConsumer(
      scheduleStatusChangedRunner,
      scheduleService,
      logger,
    );
  }

  /**
   * Starts both consumer subscription loops on their respective Kafka topics.
   *
   * @returns A promise that resolves when both consumers have started.
   */
  async start(): Promise<void> {
    logger.info(
      { module: "container" },
      "Starting inventory event consumers...",
    );
    await Promise.all([
      this.scheduleCreatedConsumer.start(),
      this.scheduleStatusChangedConsumer.start(),
    ]);
    logger.info(
      {
        module: "container",
        scheduleCreatedConsumer: CONSUMER_GROUPS.INVENTORY_SCHEDULE_CREATED,
        scheduleStatusChangedConsumer:
          CONSUMER_GROUPS.INVENTORY_SCHEDULE_STATUS_CHANGED,
      },
      "Inventory service event consumer loops started successfully.",
    );
  }

  /**
   * Retrieves the singleton container instance.
   *
   * @returns The singleton instance of InventoryContainer.
   */
  static getInstance(): InventoryContainer {
    if (!InventoryContainer.instance) {
      InventoryContainer.instance = new InventoryContainer();
    }

    return InventoryContainer.instance;
  }

  /**
   * Gracefully shuts down the consumer loops and releases network resources.
   *
   * @returns A promise that resolves when all consumers have stopped.
   */
  async disconnect(): Promise<void> {
    logger.info(
      { module: "container" },
      "Initiating graceful shutdown of event consumers...",
    );
    await Promise.all([
      this.scheduleCreatedConsumer.stop(),
      this.scheduleStatusChangedConsumer.stop(),
    ]);
    logger.info(
      { module: "container" },
      "All event consumers shut down successfully.",
    );
  }
}
