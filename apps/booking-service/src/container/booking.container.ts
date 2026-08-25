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
} from "@irctc/kafka";
import { IdempotencyRepository } from "@irctc/redis";
import { logger } from "@irctc/logger";
import { CONSUMER_GROUPS } from "@irctc/contracts";
import { BookingEventBroadcaster } from "@sse";
import { SeatsResultConsumer, PaymentResultConsumer } from "@consumers";
import {
  getInventoryGrpcClient,
  InventoryAdapter,
  getPaymentGrpcClient,
  PaymentAdapter,
} from "@grpc";

/**
 * Dependency injection container for booking-service.
 * Wires repositories, services, controllers, and consumers.
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
   * HTTP controller for the `/bookings` sub-router.
   */
  public readonly bookingController: BookingController;

  /**
   * SSE controller for `GET /bookings/:bookingId/events`.
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

  /**
   * Kafka consumer for payment-service success events.
   */
  private readonly paymentResultConsumer: PaymentResultConsumer;

  private constructor() {
    // 1. Repositories
    const outboxRepository = new PostgresOutboxRepository(prisma);
    const bookingRepository = new BookingRepository(prisma);
    const sagaRepository = new SagaRepository(prisma);

    // 2. Services
    const inventoryAdapter = new InventoryAdapter(getInventoryGrpcClient());
    const paymentAdapter = new PaymentAdapter(getPaymentGrpcClient());
    const seatLockService = new SeatLockService(redis);
    const bookingService = new BookingService(
      prisma,
      bookingRepository,
      outboxRepository,
      seatLockService,
      inventoryAdapter,
      paymentAdapter,
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
    const bookingSagaOrchestrator = new BookingSagaOrchestrator(
      prisma,
      bookingRepository,
      sagaRepository,
      sagaIdempotencyRepository,
      bookingService,
    );

    // 3. Controllers
    this.bookingController = new BookingController(bookingService);
    this.bookingEventsController = new BookingEventsController(
      bookingRepository,
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
      bookingSagaOrchestrator,
      logger,
    );

    // 6. Payment success Kafka consumer → orchestrator
    const paymentSuccessConsumer = getConsumer(
      CONSUMER_GROUPS.BOOKING_PAYMENT_SUCCESS,
    );
    const paymentSuccessRunner = new KafkaConsumerRunner(
      paymentSuccessConsumer,
      logger,
    );
    this.paymentResultConsumer = new PaymentResultConsumer(
      getProducerSync(),
      paymentSuccessRunner,
      bookingSagaOrchestrator,
      logger,
    );

    // 7. Outbox publisher worker
    this.outboxWorker = new OutboxPublisherWorker(
      outboxRepository,
      getProducerSync,
      logger,
    );

    logger.info({ module: "booking-container" }, "Dependencies wired.");
  }

  /**
   * Starts outbox publisher worker and consumer loops.
   *
   * @returns A promise that resolves when worker and consumers have started.
   */
  async start(): Promise<void> {
    this.outboxWorker.start();
    await this.bookingEventBroadcaster.start();
    await this.seatsResultConsumer.start();
    await this.paymentResultConsumer.start();
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
   * Gracefully stops the SSE broadcaster, saga-result consumers, payment consumer, and
   * outbox worker. Called during graceful shutdown BEFORE the Kafka
   * cluster disconnects, so offsets can be committed cleanly.
   *
   * @returns A promise that resolves when worker, broadcaster, and
   *   consumers have stopped.
   */
  async disconnect(): Promise<void> {
    await this.bookingEventBroadcaster.stop();
    await this.seatsResultConsumer.stop();
    await this.paymentResultConsumer.stop();
    await this.outboxWorker.stop();
  }
}
