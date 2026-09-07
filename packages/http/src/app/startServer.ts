import type { Application } from "express";
import type { Server } from "node:http";
import { logger } from "@irctc/logger";
import type { StartServerMode } from "./shutdownServer.js";
import { setShutdownContext, executeShutdown } from "./shutdownServer.js";

export type { StartServerMode };

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
  /** Defaults to `"http"`. Use `"worker"` for Kafka-only services, or `"grpc"` for pure gRPC services. */
  mode?: StartServerMode;
  /** NODE_ENV value `development`, `production`, `test`.*/
  environment: string;
  /** Runs after HTTP bind. Use for `Container.start()` (consumers, outbox worker). */
  afterListen?: (server?: Server) => Promise<void>;
  /** Runs during graceful shutdown, BEFORE HTTP close. Use to stop consumers. */
  beforeShutdown?: () => Promise<void>;
  /** Runs during graceful shutdown, AFTER HTTP close. Use to disconnect kafka/redis/prisma. */
  afterShutdown?: () => Promise<void>;
  /** Per-step timeout during shutdown in ms. Default `15000`. */
  shutdownTimeoutMs?: number;
}

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
    environment = "development",
    afterListen,
    beforeShutdown,
    afterShutdown,
    shutdownTimeoutMs = 15000,
  } = options;

  if (mode === "http" && (!app || port === undefined)) {
    throw new Error(
      `startServer: app and port are required in "http" mode (service: ${serviceName})`,
    );
  }

  const numericPort: number | undefined =
    port === undefined ? undefined : Number(port);

  const shutdownContext = {
    beforeShutdown,
    afterShutdown,
    shutdownTimeoutMs,
    mode,
    server: undefined as Server | undefined,
  };

  setShutdownContext(shutdownContext);

  process.on("SIGINT", () => {
    void executeShutdown("SIGINT", 0);
  });
  process.on("SIGTERM", () => {
    void executeShutdown("SIGTERM", 0);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error(
      { module: "server", err: reason },
      "Unhandled Promise Rejection detected. Shutting down...",
    );
    void executeShutdown("SIGTERM", 1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(
      { module: "server", err: error },
      "Uncaught Exception detected. Shutting down...",
    );
    void executeShutdown("SIGTERM", 1);
  });

  let server: Server | undefined;

  // 1. HTTP bind (server mode only).
  if (mode === "http" && app && numericPort !== undefined) {
    server = await new Promise<Server>((resolve) => {
      const bound = app.listen(numericPort, () => {
        logger.info(
          { module: "server" },
          `server listening at http://localhost:${numericPort} (${environment})`,
        );
        resolve(bound);
      });
    });
    shutdownContext.server = server;
  }

  // 2. afterListen — Container.start() (consumers, outbox worker).
  if (afterListen) {
    await afterListen(server);
  }

  logger.info(
    { module: "server" },
    `Application startup completed. Service is READY.`,
  );

  // The promise stays open until shutdown. The caller never gets a return
  // value in practice — the process exits at the end of shutdown().
  await new Promise<void>(() => {
    // Intentional: never resolves. The shutdown handler calls process.exit().
  });
};
