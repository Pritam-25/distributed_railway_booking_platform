/**
 * ## module/app/runBootstrap
 *
 * Wraps service startup in structured error logging and cleanup.
 * Prevents unhandled rejections during top-level module evaluation
 * if a dependency connection (Redis, Kafka, DB, ES) rejects before
 * process signal handlers are attached.
 */
import { logger } from "@irctc/logger";
import { triggerShutdown } from "./shutdownServer.js";

export interface RunBootstrapOptions {
  bootstrap: () => Promise<void>;
  onFailure?: () => Promise<void>;
}

/**
 * Runs the service bootstrap, wrapping the execution in error handling and cleanup logic.
 * This prevents unhandled rejections during top-level module evaluation if a
 * dependency connection (Redis, Kafka, DB, ES) rejects before process signal
 * handlers are attached.
 */
export const runBootstrap = async (
  options: RunBootstrapOptions,
): Promise<void> => {
  const { bootstrap, onFailure } = options;

  try {
    await bootstrap();
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      `Bootstrap failed during startup. Triggering graceful shutdown...`,
    );

    await triggerShutdown("SIGTERM", 1, onFailure);
  }
};
