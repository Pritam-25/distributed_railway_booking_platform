import { kafka, prisma, getProducerSync, redis } from "@config";
import {
  createConsumer,
  KafkaConsumerRunner,
  PostgresOutboxRepository,
  OutboxPublisherWorker,
  RetryPolicies,
  type OutboxRepository,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";
import {
  IdempotencyRepository,
  RouteStopRepository,
  ScheduleInventoryRepository,
  SeatAllocationRepository,
  SeatInventoryRepository,
} from "@repository";
import {
  ScheduleService,
  SeatAllocationService,
  SeatLockService,
} from "@services";
import { CONSUMER_GROUPS } from "@irctc/contracts";
import {
  HoldSeatsConsumer,
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
   * Outbox publisher worker instance.
   */
  private readonly outboxWorker: OutboxPublisherWorker;

  /**
   * Inventory-side Redis seat-segment lock service.
   * Used by `SeatAllocationService` to serialize concurrent
   * `holdSeats` invocations on overlapping (seat, segment) tuples.
   */
  public readonly seatLockService: SeatLockService;

  /**
   * Business logic for the booking-saga `holdSeats` step. Wraps the
   * segment-Redis lock, the Prisma transaction, and the outbox writes
   * for `SeatsHeldV1` / `SeatsHoldFailedV1`.
   */
  public readonly seatAllocationService: SeatAllocationService;

  /**
   * Kafka consumers
   * 1. Schedule created
   * 2. Schedule status changed
   * 3. Booking hold-seats requested
   */
  private readonly scheduleCreatedConsumer: ScheduleCreatedConsumer;
  private readonly scheduleStatusChangedConsumer: ScheduleStatusChangedConsumer;
  private readonly holdSeatsConsumer: HoldSeatsConsumer;

  private constructor() {
    // 1. Repositories
    this.outboxRepository = new PostgresOutboxRepository(prisma);
    this.outboxWorker = new OutboxPublisherWorker(
      this.outboxRepository,
      getProducerSync,
      logger,
    );

    const scheduleInventoryRepo = new ScheduleInventoryRepository(prisma);
    const routeStopRepo = new RouteStopRepository(prisma);
    const seatInventoryRepo = new SeatInventoryRepository(prisma);
    const seatAllocationRepo = new SeatAllocationRepository(prisma);
    const idempotencyRepo = new IdempotencyRepository(prisma);

    // 2. Services
    const scheduleService = new ScheduleService(
      prisma,
      scheduleInventoryRepo,
      routeStopRepo,
      seatInventoryRepo,
      this.outboxRepository,
    );

    // 2b. Inventory-side Redis seat-segment lock service.
    // Wraps seat-lock.lua / seat-unlock.lua. No renew script on this side
    // because the critical section it guards is short (~SEAT_LOCK_TTL_SEC).
    this.seatLockService = new SeatLockService(redis);

    // 2c. Booking-saga `holdSeats` business logic.
    this.seatAllocationService = new SeatAllocationService(
      prisma,
      scheduleInventoryRepo,
      routeStopRepo,
      seatInventoryRepo,
      seatAllocationRepo,
      idempotencyRepo,
      this.outboxRepository,
      this.seatLockService,
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

    const holdSeatsKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.INVENTORY_HOLD_SEATS_REQUESTED,
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

    const holdSeatsRunner = new KafkaConsumerRunner(
      holdSeatsKafkaConsumer,
      logger,
    );

    // 6. Instantiate the high-level event consumers to execute business logic
    this.scheduleCreatedConsumer = new ScheduleCreatedConsumer(
      getProducerSync(),
      scheduleCreatedRunner,
      scheduleService,
      logger,
    );

    this.scheduleStatusChangedConsumer = new ScheduleStatusChangedConsumer(
      getProducerSync(),
      scheduleStatusChangedRunner,
      scheduleService,
      logger,
    );

    this.holdSeatsConsumer = new HoldSeatsConsumer(
      getProducerSync(),
      holdSeatsRunner,
      this.seatAllocationService,
      logger,
    );

    logger.info({ module: "inventory-container" }, "Dependencies wired.");
  }

  /**
   * Starts outbox publisher worker and both consumer subscription loops on their respective Kafka topics.
   *
   * @returns A promise that resolves when worker and consumers have started.
   */
  async start(): Promise<void> {
    this.outboxWorker.start();
    await Promise.all([
      this.scheduleCreatedConsumer.start(),
      this.scheduleStatusChangedConsumer.start(),
      this.holdSeatsConsumer.start(),
    ]);
    logger.info(
      {
        module: "container",
        consumerGroups: [
          CONSUMER_GROUPS.INVENTORY_SCHEDULE_CREATED,
          CONSUMER_GROUPS.INVENTORY_SCHEDULE_STATUS_CHANGED,
          CONSUMER_GROUPS.INVENTORY_HOLD_SEATS_REQUESTED,
        ],
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
   * Gracefully shuts down the outbox worker and consumer loops and releases network resources.
   *
   * @returns A promise that resolves when all workers and consumers have stopped.
   */
  async disconnect(): Promise<void> {
    await Promise.all([
      this.outboxWorker.stop(),
      this.scheduleCreatedConsumer.stop(),
      this.scheduleStatusChangedConsumer.stop(),
      this.holdSeatsConsumer.stop(),
    ]);
    logger.info(
      { module: "container" },
      "All event consumers shut down successfully.",
    );
  }
}
