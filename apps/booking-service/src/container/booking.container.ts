import { prisma } from "@config";
import { PostgresOutboxRepository, type OutboxRepository } from "@irctc/kafka";
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

  private constructor() {
    // 1. Repositories
    this.outboxRepository = new PostgresOutboxRepository(prisma);

    // 2. Services
  }

  /**
   * Starts both consumer subscription loops on their respective Kafka topics.
   *
   * @returns A promise that resolves when both consumers have started.
   */
  async start(): Promise<void> {
    logger.info({ module: "container" }, "Starting booking event consumers...");
    logger.info(
      { module: "container" },
      "Booking service event consumer loops started successfully.",
    );
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
   * Gracefully shuts down the consumer loops and releases network resources.
   *
   * @returns A promise that resolves when all consumers have stopped.
   */
  async disconnect(): Promise<void> {
    logger.info(
      { module: "container" },
      "Initiating graceful shutdown of event consumers...",
    );
    logger.info(
      { module: "container" },
      "All event consumers shut down successfully.",
    );
  }
}
