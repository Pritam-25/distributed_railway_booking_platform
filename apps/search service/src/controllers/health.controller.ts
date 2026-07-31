import type { Request, Response } from "express";
import { statusCode, successResponse, errorResponse } from "@irctc/http";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { HealthService } from "@services";
import { logger } from "@irctc/logger";

/**
 * Liveness probe. Returns 200 as long as the process is up; touches no
 * dependencies and is safe to call on every k8s probe tick.
 *
 * @param _req - Express request (unused).
 * @param res - Express response.
 */
export const liveCheck = (_req: Request, res: Response): void => {
  res.status(statusCode.success).json(
    successResponse("Service is alive", {
      status: "alive",
      uptime: process.uptime(),
    }),
  );
};

/**
 * Readiness probe. Returns 200 when all dependency probes pass, 503
 * otherwise. Catches unexpected exceptions and surfaces them as a generic
 * `INTERNAL_ERROR` so a buggy probe never returns an empty body.
 *
 * Never throws. Every failure mode is converted to an {@link ApiError} and
 * surfaced via {@link errorResponse}.
 *
 * @param _req - Express request (unused).
 * @param res - Express response.
 */
export const readyCheck = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    // 1. Run every dependency probe in parallel
    const checks = await HealthService.runReadinessChecks();
    const allHealthy = Object.values(checks).every((c) => c.ok);

    // 2. Surface 503 + per-check breakdown on any failure
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
    // 3. Buggy probe fallback — never let the readiness response be empty.
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
};
