import {
  HealthCheckResponse_ServingStatus,
  type HealthCheckResponse,
  type HealthListResponse,
} from "@irctc/contracts";
import { healthDependencies } from "../health/dependencies.js";
import { logger } from "@irctc/logger";

/**
 *
 */
export class HealthChecker {
  private static instance: HealthChecker | null = null;
  private shuttingDown = false;

  /**
   *
   */
  public static getInstance(): HealthChecker {
    if (!HealthChecker.instance) {
      HealthChecker.instance = new HealthChecker();
    }
    return HealthChecker.instance;
  }

  /**
   *
   */
  public setShuttingDown(value = true): void {
    this.shuttingDown = value;
  }

  /**
   *
   */
  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Evaluates readiness by executing registered health probes for database, redis, and kafka.
   */
  public async checkReadiness(): Promise<HealthCheckResponse_ServingStatus> {
    if (this.shuttingDown) {
      return HealthCheckResponse_ServingStatus.NOT_SERVING;
    }

    try {
      const results = await Promise.all(
        healthDependencies.map((dep) => dep.check()),
      );
      const allHealthy = results.every((res) => res.ok);

      if (!allHealthy) {
        const failed = results.filter((res) => !res.ok).map((res) => res.name);
        logger.warn(
          { module: "grpc-health", failed },
          "Health readiness probe failed for dependencies",
        );
        return HealthCheckResponse_ServingStatus.NOT_SERVING;
      }

      return HealthCheckResponse_ServingStatus.SERVING;
    } catch (error) {
      logger.error(
        { module: "grpc-health", err: error },
        "Error evaluating health readiness dependencies",
      );
      return HealthCheckResponse_ServingStatus.NOT_SERVING;
    }
  }

  /**
   * Checks the health of a specific service.
   * - "liveness": Process health check (returns SERVING unless shutting down).
   * - "readiness" or "": Overall dependency check (returns SERVING or NOT_SERVING).
   * - unknown service: Returns null (caller throws Status.NOT_FOUND for Check).
   */
  public async check(
    service: string,
  ): Promise<HealthCheckResponse_ServingStatus | null> {
    if (this.shuttingDown) {
      return HealthCheckResponse_ServingStatus.NOT_SERVING;
    }

    if (service === "liveness") {
      return HealthCheckResponse_ServingStatus.SERVING;
    }

    if (service === "readiness" || service === "") {
      return await this.checkReadiness();
    }

    // Service is unknown
    return null;
  }

  /**
   * Returns a snapshot of health statuses for all known services.
   */
  public async list(): Promise<HealthListResponse> {
    const liveness = this.shuttingDown
      ? HealthCheckResponse_ServingStatus.NOT_SERVING
      : HealthCheckResponse_ServingStatus.SERVING;
    const readiness = await this.checkReadiness();

    const statusesMap: Record<string, HealthCheckResponse> = {
      "": { status: readiness },
      liveness: { status: liveness },
      readiness: { status: readiness },
    };

    return {
      statuses: statusesMap,
    };
  }
}
