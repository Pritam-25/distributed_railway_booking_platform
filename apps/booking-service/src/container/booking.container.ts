import { prisma, redis, getProducerSync } from "@config";
import { BookingController } from "@controllers";
import { BookingService, SeatLockService } from "@services";
import { BookingRepository } from "@repository";
import {
  PostgresOutboxRepository,
  OutboxPublisherWorker,
  type OutboxRepository,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";

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
   * HTTP controller for the `/bookings` sub-router.
   *
   * Public field because `routes/booking.routes.ts` looks it up via
   * `import { bookingController } from "@container"` during route
   * module evaluation.
   */
  public readonly bookingController: BookingController;

  /**
   * Outbox publisher worker instance.
   */
  private readonly outboxWorker: OutboxPublisherWorker;

  private constructor() {
    // 1. Repositories
    this.outboxRepository = new PostgresOutboxRepository(prisma);
    this.bookingRepository = new BookingRepository(prisma);

    // 2. Services
    this.seatLockService = new SeatLockService(redis);
    this.bookingService = new BookingService(
      prisma,
      this.bookingRepository,
      this.outboxRepository,
      this.seatLockService,
    );

    // 3. Controllers
    this.bookingController = new BookingController(this.bookingService);

    // 4. Workers
    this.outboxWorker = new OutboxPublisherWorker(
      this.outboxRepository,
      getProducerSync,
      logger,
    );

    logger.info({ module: "booking-container" }, "Dependencies wired.");
  }

  /**
   * Starts outbox publisher worker and event consumer loops.
   *
   * @returns A promise that resolves when worker and consumers have started.
   */
  async start(): Promise<void> {
    this.outboxWorker.start();
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
   * Gracefully shuts down the outbox worker and consumer loops and releases resources.
   *
   * @returns A promise that resolves when all workers and consumers have stopped.
   */
  async disconnect(): Promise<void> {
    await this.outboxWorker.stop();
  }
}
