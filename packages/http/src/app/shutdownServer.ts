import type { Server } from "node:http";
import { logger } from "@irctc/logger";
import { shutdownTelemetry } from "@irctc/telemetry";
import { withTimeout } from "./withTimeout.js";

/**
 * Execution mode for shutdown handler.
 */
export type StartServerMode = "http" | "worker" | "grpc";

/**
 * Context holding registered shutdown lifecycle hooks and server instance.
 */
export interface ActiveShutdownContext {
  beforeShutdown?: () => Promise<void>;
  afterShutdown?: () => Promise<void>;
  shutdownTimeoutMs: number;
  mode: StartServerMode;
  server?: Server;
}

// Module-level idempotency guard and active context for graceful shutdown.
let isShuttingDown = false;
let activeShutdownContext: ActiveShutdownContext | undefined;

/**
 * Registers active shutdown context for the running service.
 */
export const setShutdownContext = (context: ActiveShutdownContext): void => {
  activeShutdownContext = context;
};

/**
 * Shared graceful shutdown routine. Executes all hooks (`beforeShutdown`, HTTP close,
 * `afterShutdown`, and `shutdownTelemetry`) before calling `process.exit`.
 *
 * @param signal - Signal or origin trigger.
 * @param exitCode - Desired exit code.
 * @param fallbackCleanup - Optional cleanup callback when no afterShutdown context is set.
 */
export const executeShutdown = async (
  signal: NodeJS.Signals,
  exitCode = 0,
  fallbackCleanup?: () => Promise<void>,
): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  let hadError = false;

  logger.info(
    { module: "server" },
    `Received ${signal} (exitCode=${exitCode}), shutting down gracefully...`,
  );

  const ctx = activeShutdownContext;

  // 1. Stop consumers / container before the HTTP server stops accepting
  //    traffic (or in worker mode, before dependencies are disconnected).
  if (ctx?.beforeShutdown) {
    try {
      await withTimeout(
        "beforeShutdown",
        ctx.beforeShutdown(),
        ctx.shutdownTimeoutMs,
      );
      logger.info({ module: "server" }, "beforeShutdown done.");
    } catch (error) {
      logger.error({ module: "server", err: error }, "beforeShutdown failed.");
      hadError = true;
    }
  }

  // 2. Drain HTTP in server mode.
  if (ctx?.mode === "http" && ctx.server) {
    try {
      await withTimeout(
        "HTTP server close",
        new Promise<void>((resolve, reject) => {
          ctx.server!.close((err) => {
            if (err) return reject(err);
            resolve();
          });
        }),
        ctx.shutdownTimeoutMs,
      );
      logger.info({ module: "server" }, "HTTP server closed.");
    } catch (error) {
      logger.error(
        { module: "server", err: error },
        "Error occurred while closing HTTP server.",
      );
      hadError = true;
    }
  }

  // 3. Disconnect Kafka / Redis / Prisma / ES.
  const cleanupFn = ctx?.afterShutdown ?? fallbackCleanup;
  if (cleanupFn) {
    try {
      await withTimeout(
        "afterShutdown",
        cleanupFn(),
        ctx?.shutdownTimeoutMs ?? 15000,
      );
      logger.info({ module: "server" }, "afterShutdown done.");
    } catch (error) {
      logger.error({ module: "server", err: error }, "afterShutdown failed.");
      hadError = true;
    }
  }

  // 4. Telemetry is always the last step.
  try {
    await withTimeout(
      "Telemetry shutdown",
      shutdownTelemetry(),
      ctx?.shutdownTimeoutMs ?? 15000,
    );
    logger.info({ module: "server" }, "Telemetry shutdown successfully.");
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      "Error occurred while shutting down telemetry.",
    );
    hadError = true;
  }

  process.exit(hadError ? Math.max(exitCode, 1) : exitCode);
};

/**
 * Triggers a graceful shutdown programmatically.
 *
 * @param signal - Signal name to surface in logs.
 * @param exitCode - Process exit code when no error occurred.
 * @param fallbackCleanup - Optional cleanup handler.
 */
export const triggerShutdown = async (
  signal: NodeJS.Signals,
  exitCode = 0,
  fallbackCleanup?: () => Promise<void>,
): Promise<void> => {
  await executeShutdown(signal, exitCode, fallbackCleanup);
};
