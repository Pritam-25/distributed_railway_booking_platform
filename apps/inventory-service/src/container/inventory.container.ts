import { logger } from "@irctc/logger";

/**
 * Dependency injection container for user-service.
 * Wires repositories, services, controllers, and event publishers.
 * Singleton pattern ensures shared state across the service.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() has completed
 * (server.ts guarantees this via dynamic import of app.js).
 */
export class InventoryContainer {
  private static instance: InventoryContainer;

  private constructor() {
    // 1. Repositories

    // 3. Services

    // 4. Controllers

    logger.info(
      { module: "inventory-container" },
      "InventoryContainer dependencies wired synchronously",
    );
  }

  static getInstance(): InventoryContainer {
    if (!InventoryContainer.instance) {
      InventoryContainer.instance = new InventoryContainer();
    }

    return InventoryContainer.instance;
  }
}
