import type { Request, Response } from "express";
import { errorResponse, statusCode, successResponse } from "@irctc/http";
import { HealthService } from "@services";
import { logger } from "@irctc/logger";

export const liveCheck = (_req: Request, res: Response) => {
  res.status(statusCode.success).json(
    successResponse("Service is alive", {
      status: "alive",
      uptime: process.uptime(),
    }),
  );
};

export const readyCheck = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const checks = await HealthService.runReadinessChecks();
    const allHealthy = Object.values(checks).every((v) => v === true);

    if (!allHealthy) {
      res.status(statusCode.serviceUnavailable).json(
        errorResponse("Service is unhealthy", {
          status: "unhealthy",
          checks,
        }),
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
    res.status(statusCode.serviceUnavailable).json({
      status: "error",
      message: "Health check failed",
    });
  }
};
