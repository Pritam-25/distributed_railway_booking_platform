import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import { runReadinessChecks } from "./health.service.js";

/**
 * Liveness probe — returns 200 as long as the process is up.
 * No dependency calls. Used by k8s liveness to decide whether
 * to restart the pod.
 */
export const liveCheck = (_req: Request, res: Response): void => {
  res.status(statusCode.success).json(
    successResponse("Gateway is alive", {
      status: "alive",
      uptime: process.uptime(),
    }),
  );
};

/**
 * Readiness probe — returns 200 when all dependency probes pass,
 * 503 otherwise. Used by k8s readiness to gate traffic.
 */
export const readyCheck = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const checks = await runReadinessChecks();
  const allOk = Object.values(checks).every((c) => c.ok);

  if (!allOk) {
    res.status(statusCode.serviceUnavailable).json({
      success: false,
      status: "unhealthy",
      checks,
    });
    return;
  }

  res.status(statusCode.success).json(
    successResponse("Gateway is ready", {
      status: "ready",
      checks,
    }),
  );
};
