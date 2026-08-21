import { prisma, redis, env, getProducerSync, getConsumer } from "@config";
import { BookingController, BookingEventsController } from "@controllers";
import {
  BookingSagaOrchestrator,
  BookingService,
  SeatLockService,
} from "@services";
import { BookingRepository, SagaRepository } from "@repository";
import {
  KafkaConsumerRunner,
  PostgresOutboxRepository,
  OutboxPublisherWorker,
  type OutboxRepository,
} from "@irctc/kafka";
import { IdempotencyRepository } from "@irctc/redis";
import { logger } from "@irctc/logger";
import { CONSUMER_GROUPS } from "@irctc/contracts";
import { BookingEventBroadcaster } from "../sse/booking-event-broadcaster.js";
import { SeatsResultConsumer } from "../consumers/seats-result.consumer.js";
import { getInventoryGrpcClient, InventoryAdapter } from "@grpc";

/**
 * Dependency injection container for booking-service.
 * Wires repositories, services, and consumers.
 * Singleton pattern ensures shared state across the service.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() has completed
 * (server.ts guarantees this via dynamic import of container).
 */
export class BookingContainer {
  /**
   * Singleton instance of the BookingContainer.
   */
  private static instance: BookingContainer;

  /**
   * Outbox repository instance.
   */
  public readonly outboxRepository: OutboxRepository;

  /**
   * Booking aggregate repository.
   */
  public readonly bookingRepository: BookingRepository;

  /**
   * Seat lock service instance.
   */
  public readonly seatLockService: SeatLockService;

  /**
   * Booking service that owns the saga business logic.
   */
  public readonly bookingService: BookingService;

  /**
   * Saga orchestrator routing inventory-service seat-hold replies to
   * booking status transitions.
   */
  public readonly bookingSagaOrchestrator: BookingSagaOrchestrator;

  /**
   * HTTP controller for the `/bookings` sub-router.
   *
   * Public field because `routes/booking.routes.ts` looks it up via
   * `import { bookingController } from "@container"` during route
   * module evaluation.
   */
  public readonly bookingController: BookingController;

  /**
   * SSE controller for `GET /bookings/:bookingId/events`.
   *
   * Public field so the SSE sub-router can resolve it at route
   * registration time.
   */
  public readonly bookingEventsController: BookingEventsController;

  /**
   * Outbox publisher worker instance.
   */
  private readonly outboxWorker: OutboxPublisherWorker;

  /**
   * Kafka consumer that fans out `BookingStatusChangedV1` to Redis pub/sub.
   */
  private readonly bookingEventBroadcaster: BookingEventBroadcaster;

  /**
   * Kafka consumer for inventory-service saga-result events.
   */
  private readonly seatsResultConsumer: SeatsResultConsumer;

  private constructor() {
    // 1. Repositories
    this.outboxRepository = new PostgresOutboxRepository(prisma);
    this.bookingRepository = new BookingRepository(prisma);
    const sagaRepository = new SagaRepository(prisma);

    // 2. Services
    const inventoryAdapter = new InventoryAdapter(getInventoryGrpcClient());
    this.seatLockService = new SeatLockService(redis);
    this.bookingService = new BookingService(
      prisma,
      this.bookingRepository,
      this.outboxRepository,
      this.seatLockService,
      inventoryAdapter,
      sagaRepository,
    );

    // 2b. Saga orchestrator — handles inventory-side seat-hold replies
    // and updates booking status / saga log via two-phase Redis idempotency.
    const sagaIdempotencyRepository = new IdempotencyRepository(
      redis,
      env.SAGA_IDEMPOTENCY_PROCESSING_LEASE_SEC,
      env.SAGA_IDEMPOTENCY_PROCESSED_TTL_SEC,
      env.SAGA_IDEMPOTENCY_KEYSPACE,
    );
    this.bookingSagaOrchestrator = new BookingSagaOrchestrator(
      prisma,
      this.bookingRepository,
      sagaRepository,
      sagaIdempotencyRepository,
      this.bookingService,
    );

    // 3. Controllers
    this.bookingController = new BookingController(this.bookingService);
    this.bookingEventsController = new BookingEventsController(
      this.bookingRepository,
      () => redis.duplicate(),
    );

    // 4. SSE Kafka consumer → Redis pub/sub broadcaster
    const statusBroadcastConsumer = getConsumer(
      CONSUMER_GROUPS.BOOKING_STATUS_BROADCAST,
    );
    const statusBroadcastRunner = new KafkaConsumerRunner(
      statusBroadcastConsumer,
      logger,
    );
    this.bookingEventBroadcaster = new BookingEventBroadcaster(
      statusBroadcastRunner,
      redis,
      logger,
    );

    // 5. Saga-result Kafka consumer → orchestrator
    const seatsHeldConsumer = getConsumer(CONSUMER_GROUPS.BOOKING_SEATS_RESULT);
    const seatsHoldFailedConsumer = getConsumer(
      CONSUMER_GROUPS.BOOKING_SEATS_RESULT,
    );
    const seatHoldExpiredConsumer = getConsumer(
      CONSUMER_GROUPS.BOOKING_SEATS_RESULT,
    );
    const seatsHeldRunner = new KafkaConsumerRunner(seatsHeldConsumer, logger);
    const seatsHoldFailedRunner = new KafkaConsumerRunner(
      seatsHoldFailedConsumer,
      logger,
    );
    const seatHoldExpiredRunner = new KafkaConsumerRunner(
      seatHoldExpiredConsumer,
      logger,
    );
    this.seatsResultConsumer = new SeatsResultConsumer(
      getProducerSync(),
      seatsHeldRunner,
      seatsHoldFailedRunner,
      seatHoldExpiredRunner,
      this.bookingSagaOrchestrator,
      logger,
    );

    // 6. Outbox publisher worker
    this.outboxWorker = new OutboxPublisherWorker(
      this.outboxRepository,
      getProducerSync,
      logger,
    );

    logger.info({ module: "booking-container" }, "Dependencies wired.");
  }

  /**
   * Starts outbox publisher worker and the SSE broadcaster consumer loop.
   *
   * @returns A promise that resolves when worker and consumer have started.
   */
  async start(): Promise<void> {
    this.outboxWorker.start();
    await this.bookingEventBroadcaster.start();
    await this.seatsResultConsumer.start();
  }

  /**
   * Retrieves the singleton container instance.
   *
   * @returns The singleton instance of BookingContainer.
   */
  static getInstance(): BookingContainer {
    if (!BookingContainer.instance) {
      BookingContainer.instance = new BookingContainer();
    }

    return BookingContainer.instance;
  }

  /**
   * Gracefully stops the SSE broadcaster, the saga-result consumer, and
   * the outbox worker. Called during graceful shutdown BEFORE the Kafka
   * cluster disconnects, so offsets can be committed cleanly.
   *
   * @returns A promise that resolves when worker, broadcaster, and
   *   consumer have stopped.
   */
  async disconnect(): Promise<void> {
    await this.bookingEventBroadcaster.stop();
    await this.seatsResultConsumer.stop();
    await this.outboxWorker.stop();
  }
}
