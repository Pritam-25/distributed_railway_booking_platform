import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "@irctc/logger";
import { statusCode } from "../constants/statusCodes.js";
import { successResponse, errorResponse } from "../response/apiResponse.js";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { withTimeout } from "../app/withTimeout.js";
import type { CreateHealthRouterOptions, HealthChecks } from "./types.js";

/**
 * Builds the Kubernetes-friendly health router.
 *
 * ### Routes
 * - `GET /live` — liveness. Returns `200 { status: "alive", uptime }` if the
 *   process is up. Performs no dependency calls. Used by k8s liveness probe
 *   to decide whether to restart the pod.
 * - `GET /ready` — readiness. Runs every dependency probe in parallel,
 *   bounded by `probeTimeoutMs`. Returns:
 *
 *   | Outcome | Status | Body |
 *   | --- | --- | --- |
 *   | All probes pass | 200 | `{ status: "ready", checks }` |
 *   | Any probe fails | 503 | `{ status: "unhealthy", checks }` |
 *   | Aggregate throws | 503 | `{ status: "error", error }` |
 *
 *   Each `HealthDependency.check()` is wrapped in `withTimeout(...)` so a
 *   single slow dependency cannot hang the response past the k8s grace
 *   window.
 *
 * ### Side Effects
 * - **Logger**: emits `WARN` for individual probe failures, `ERROR` for
 *   aggregate failures.
 *
 * @param options - Probe list and timeout configuration.
 * @returns Express `Router` with `/live` and `/ready` mounted.
 */
export const createHealthRouter = (
  options: CreateHealthRouterOptions,
): Router => {
  const { dependencies, probeTimeoutMs = 5000 } = options;
  const router = Router();

  /**
   * Liveness probe — returns 200 as long as the process is up.
   */
  router.get("/live", (_req: Request, res: Response): void => {
    res.status(statusCode.success).json(
      successResponse("Service is alive", {
        status: "alive",
        uptime: process.uptime(),
      }),
    );
  });

  /**
   * Readiness probe — returns 200 when all dependency probes pass,
   * 503 otherwise. Never throws.
   */
  router.get("/ready", async (_req: Request, res: Response): Promise<void> => {
    try {
      const probeResults = await Promise.all(
        dependencies.map((dep) =>
          withTimeout(`${dep.name} probe`, dep.check(), probeTimeoutMs),
        ),
      );

      const checks: HealthChecks = Object.fromEntries(
        dependencies.map((dep, index) => [dep.name, probeResults[index]!]),
      );

      const allHealthy = probeResults.every((r) => r.ok);

      if (!allHealthy) {
        res.status(statusCode.serviceUnavailable).json(
          errorResponse(
            new ApiError(
              statusCode.serviceUnavailable,
              COMMON_ERROR_CODES.SERVICE_UNAVAILABLE,
              "Service is unhealthy",
            ),
            {
              status: "unhealthy",
              checks,
            },
          ),
        );
        return;
      }

      res.status(statusCode.success).json(
        successResponse("Service is ready", {
          status: "ready",
          checks,
        }),
      );
    } catch (error) {
      logger.error(
        { err: error, module: "health" },
        "Health readiness check failed",
      );
      res.status(statusCode.serviceUnavailable).json(
        errorResponse(
          new ApiError(
            statusCode.serviceUnavailable,
            COMMON_ERROR_CODES.INTERNAL_ERROR,
            "Health check failed",
          ),
          {
            status: "error",
            error: "Internal health check execution error",
          },
        ),
      );
    }
  });

  return router;
};
