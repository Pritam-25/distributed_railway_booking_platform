import type { Request, Response } from "express";
import { statusCode, successResponse, errorResponse } from "@irctc/http";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { HealthService } from "@services";
import { logger } from "@irctc/logger";

/**
 * Liveness probe — returns 200 as long as the process is up.
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
 * Readiness probe — returns 200 when all dependency probes pass,
 * 503 otherwise.
 */
export const readyCheck = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const checks = await HealthService.runReadinessChecks();
    const allHealthy = Object.values(checks).every((c) => c.ok);

    if (!allHealthy) {
      res.status(statusCode.serviceUnavailable).json(
        errorResponse(
          new ApiError(
            statusCode.serviceUnavailable,
            ERROR_CODES.SERVICE_UNAVAILABLE,
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
          ERROR_CODES.INTERNAL_ERROR,
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
