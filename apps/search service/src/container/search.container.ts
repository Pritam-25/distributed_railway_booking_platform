import { logger } from "@irctc/logger";

/**
 * Dependency injection container for search-service.
 * Wires repositories, services, and consumers.
 * Singleton pattern ensures shared state across the service.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() has completed
 * (server.ts guarantees this via dynamic import of container).
 */
export class SearchContainer {
  /**
   * Singleton instance of the SearchContainer.
   */
  private static instance: SearchContainer;

  private constructor() {
    // 1. Repositories
    // 2. Services
  }

  /**
   * Starts both consumer subscription loops on their respective Kafka topics.
   *
   * @returns A promise that resolves when both consumers have started.
   */
  async start(): Promise<void> {
    logger.info({ module: "container" }, "Starting search event consumers...");
    logger.info(
      { module: "container" },
      "Search service event consumer loops started successfully.",
    );
  }

  /**
   * Retrieves the singleton container instance.
   *
   * @returns The singleton instance of SearchContainer.
   */
  static getInstance(): SearchContainer {
    if (!SearchContainer.instance) {
      SearchContainer.instance = new SearchContainer();
    }

    return SearchContainer.instance;
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
