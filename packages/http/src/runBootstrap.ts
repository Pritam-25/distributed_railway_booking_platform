/**
 * ## module/runBootstrap
 *
 * Wraps service startup in structured error logging and cleanup.
 * Prevents unhandled rejections during top-level module evaluation
 * if a dependency connection (Redis, Kafka, DB, ES) rejects before
 * process signal handlers are attached.
 */
import { logger } from "@irctc/logger";
import { triggerShutdown } from "./startServer.js";

export interface RunBootstrapOptions {
  bootstrap: () => Promise<void>;
  onFailure?: () => Promise<void>;
}

export const runBootstrap = async (
  options: RunBootstrapOptions,
): Promise<void> => {
  const { bootstrap, onFailure } = options;

  try {
    await bootstrap();
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      `Bootstrap failed during startup. Executing failure cleanup...`,
    );

    if (onFailure) {
      try {
        await onFailure();
      } catch (cleanupError) {
        logger.error(
          { module: "server", err: cleanupError },
          "Error occurred during bootstrap failure cleanup.",
        );
      }
    }

    await triggerShutdown("SIGTERM", 1);
  }
};
