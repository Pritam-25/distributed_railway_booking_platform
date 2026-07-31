/**
 * ## module/startServer
 *
 * Full bootstrap: lifecycle hooks, HTTP bind, graceful shutdown, signal
 * handlers. Replaces the per-service `server.ts` (160-255 lines each) with
 * a single composition call.
 *
 * ### Lifecycle
 *
 * 1. `beforeListen` — env load, prisma connect, redis init, kafka init
 * 2. HTTP bind
 * 3. `afterListen` — `Container.start()` (consumers, outbox worker)
 * 4. `SIGINT` / `SIGTERM` / `unhandledRejection` / `uncaughtException` wired
 * 5. Shutdown on signal:
 *    a. `beforeShutdown` — Container.disconnect (consumers)
 *    b. HTTP server close
 *    c. `afterShutdown` — disconnect Kafka, Redis, Prisma
 *    d. `shutdownTelemetry` (always last)
 *    e. `process.exit(...)`
 *
 * @packageDocumentation
 */

import type { Application } from "express";
import type { Server } from "node:http";
import { logger } from "@irctc/logger";
import { shutdownTelemetry } from "@irctc/telemetry";
import { withTimeout } from "./withTimeout.js";

/**
 * Execution mode.
 *
 * - `"http"` — bind the HTTP port. Requires `app` and `port`.
 * - `"worker"` — no HTTP port. `app` may be omitted. The shutdown sequence
 *   skips the HTTP-close step.
 */
export type StartServerMode = "http" | "worker";

/**
 * Options for `startServer`.
 */
export interface StartServerOptions {
  /** Service name. Used for log enrichment only. */
  serviceName: string;
  /** Required for `"http"` mode. The configured Express app. */
  app?: Application;
  /** Required for `"http"` mode. Port to bind (string or number; coerced internally). */
  port?: string | number;
  /** Defaults to `"http"`. Use `"worker"` for Kafka-only services. */
  mode?: StartServerMode;
  /** Runs before HTTP bind. Use for env load, prisma connect, redis init, kafka init. */
  beforeListen?: () => Promise<void>;
  /** Runs after HTTP bind. Use for `Container.start()` (consumers, outbox worker). */
  afterListen?: (server: Server) => Promise<void>;
  /** Runs during graceful shutdown, BEFORE HTTP close. Use to stop consumers. */
  beforeShutdown?: () => Promise<void>;
  /** Runs during graceful shutdown, AFTER HTTP close. Use to disconnect kafka/redis/prisma. */
  afterShutdown?: () => Promise<void>;
  /** Per-step timeout during shutdown in ms. Default `5000`. */
  shutdownTimeoutMs?: number;
}

// Module-level idempotency guard. A second signal during shutdown is a no-op.
let isShuttingDown = false;

/**
 * Bootstraps the service, binds the HTTP port (in `"http"` mode), wires
 * signal handlers, and orchestrates graceful shutdown.
 *
 * ### Behaviour
 *
 * - The returned promise resolves when the server stops (the caller never
 *   sees a return value in practice — the process exits at the end of the
 *   shutdown sequence).
 * - `SIGINT` and `SIGTERM` invoke the same shutdown routine.
 * - `unhandledRejection` and `uncaughtException` log and trigger shutdown
 *   with exit code `1`.
 * - Every shutdown step is wrapped in `withTimeout(...)` so a hung
 *   dependency cannot keep the pod alive past the k8s grace window.
 * - `shutdownTelemetry` is **always** the last step before `process.exit`.
 *
 * ### Side Effects
 *
 * - **Process**: registers `SIGINT`, `SIGTERM`, `unhandledRejection`,
 *   `uncaughtException` handlers. Calls `process.exit(...)` at the end of
 *   the shutdown sequence.
 * - **HTTP**: binds the configured port (in `"http"` mode).
 * - **Telemetry**: flushes spans via `shutdownTelemetry()`.
 *
 * @param options - Lifecycle configuration.
 */
export const startServer = async (
  options: StartServerOptions,
): Promise<void> => {
  const {
    serviceName,
    app,
    port,
    mode = "http",
    beforeListen,
    afterListen,
    beforeShutdown,
    afterShutdown,
    shutdownTimeoutMs = 5000,
  } = options;

  if (mode === "http" && (!app || port === undefined)) {
    throw new Error(
      `startServer: app and port are required in "http" mode (service: ${serviceName})`,
    );
  }

  const numericPort: number | undefined =
    port === undefined ? undefined : Number(port);

  let server: Server | undefined;

  const shutdown = async (
    signal: NodeJS.Signals,
    exitCode = 0,
  ): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    let hadError = false;

    logger.info(
      { module: "server", serviceName },
      `Received ${signal}, shutting down gracefully...`,
    );

    // 1. Stop consumers / container before the HTTP server stops accepting
    //    traffic (or in worker mode, before dependencies are disconnected).
    if (beforeShutdown) {
      try {
        await withTimeout(
          "beforeShutdown",
          beforeShutdown(),
          shutdownTimeoutMs,
        );
        logger.info({ module: "server", serviceName }, "beforeShutdown done.");
      } catch (error) {
        logger.error(
          { module: "server", serviceName, err: error },
          "beforeShutdown failed.",
        );
        hadError = true;
      }
    }

    // 2. Drain HTTP in server mode.
    if (mode === "http" && server) {
      try {
        await withTimeout(
          "HTTP server close",
          new Promise<void>((resolve, reject) => {
            server!.close((err) => {
              if (err) return reject(err);
              resolve();
            });
          }),
          shutdownTimeoutMs,
        );
        logger.info({ module: "server", serviceName }, "HTTP server closed.");
      } catch (error) {
        logger.error(
          { module: "server", serviceName, err: error },
          "Error occurred while closing HTTP server.",
        );
        hadError = true;
      }
    }

    // 3. Disconnect Kafka / Redis / Prisma / ES.
    if (afterShutdown) {
      try {
        await withTimeout("afterShutdown", afterShutdown(), shutdownTimeoutMs);
        logger.info({ module: "server", serviceName }, "afterShutdown done.");
      } catch (error) {
        logger.error(
          { module: "server", serviceName, err: error },
          "afterShutdown failed.",
        );
        hadError = true;
      }
    }

    // 4. Telemetry is always the last step.
    try {
      await withTimeout(
        "Telemetry shutdown",
        shutdownTelemetry(),
        shutdownTimeoutMs,
      );
      logger.info(
        { module: "server", serviceName },
        "Telemetry shutdown successfully.",
      );
    } catch (error) {
      logger.error(
        { module: "server", serviceName, err: error },
        "Error occurred while shutting down telemetry.",
      );
      hadError = true;
    }

    process.exit(hadError ? Math.max(exitCode, 1) : exitCode);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error(
      { module: "server", serviceName, err: reason },
      "Unhandled Promise Rejection detected. Shutting down...",
    );
    void shutdown("SIGTERM", 1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(
      { module: "server", serviceName, err: error },
      "Uncaught Exception detected. Shutting down...",
    );
    void shutdown("SIGTERM", 1);
  });

  // 1. beforeListen — env load, prisma connect, redis init, kafka init.
  if (beforeListen) {
    await beforeListen();
  }

  // 2. HTTP bind (server mode only).
  if (mode === "http" && app && numericPort !== undefined) {
    server = await new Promise<Server>((resolve) => {
      const bound = app.listen(numericPort, () => {
        logger.info(
          { module: "server", serviceName },
          `server listening at http://localhost:${numericPort}`,
        );
        resolve(bound);
      });
    });
  }

  // 3. afterListen — Container.start() (consumers, outbox worker).
  if (afterListen) {
    await afterListen(server as Server);
  }

  // The promise stays open until shutdown. The caller never gets a return
  // value in practice — the process exits at the end of shutdown().
  await new Promise<void>(() => {
    // Intentional: never resolves. The shutdown handler calls process.exit().
  });
};

/**
 * Internal helper used by `startServer`'s caller. Triggers a graceful
 * shutdown programmatically (used when `startServer` is awaited from a
 * top-level try/catch and a startup failure needs to drain).
 *
 * @param signal - Signal name to surface in logs.
 * @param exitCode - Process exit code when no error occurred.
 */
export const triggerShutdown = async (
  signal: NodeJS.Signals,
  exitCode = 0,
): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  // The wider shutdown routine lives inside `startServer`. This is a
  // placeholder for services that need to drive shutdown from outside
  // (e.g. as the catch-arm of a startup try/catch). The full variant
  // requires the running `startServer` context.
  logger.info(
    { module: "server" },
    `triggerShutdown called with ${signal}, exitCode=${exitCode}`,
  );
  process.exit(exitCode);
};
