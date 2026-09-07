import { ServerError, Status } from "nice-grpc";
import {
  HealthCheckResponse_ServingStatus,
  type HealthCheckRequest,
  type HealthCheckResponse,
  type HealthListResponse,
  type HealthServiceImplementation,
} from "@irctc/contracts";
import { logger } from "@irctc/logger";
import type {
  GrpcHealthDependency,
  GrpcHealthOptions,
  GrpcHealthProbeResult,
} from "../types.js";

/**
 * Singleton managing gRPC liveness and readiness health state.
 */
export class HealthChecker {
  private static instance: HealthChecker | null = null;
  private shuttingDown = false;
  private dependencies: GrpcHealthDependency[] = [];

  /**
   * Retrieves or creates the singleton HealthChecker instance.
   *
   * @param options - Configuration options containing dependency health probes.
   * @returns The singleton HealthChecker instance.
   */
  public static getInstance(options?: GrpcHealthOptions): HealthChecker {
    HealthChecker.instance ??= new HealthChecker();
    if (options?.dependencies) {
      HealthChecker.instance.setDependencies(options.dependencies);
    }
    return HealthChecker.instance;
  }

  /**
   * Registers health dependency probes.
   *
   * @param dependencies - Array of health dependency probes.
   */
  public setDependencies(dependencies: GrpcHealthDependency[]): void {
    this.dependencies = dependencies;
  }

  /**
   * Updates the shutdown state of the server.
   *
   * @param value - Boolean flag indicating if server is shutting down.
   */
  public setShuttingDown(value = true): void {
    this.shuttingDown = value;
  }

  /**
   * Checks if the server is currently shutting down.
   *
   * @returns True if the server is shutting down.
   */
  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Evaluates readiness by executing registered health probes for database, redis, kafka, etc.
   *
   * @returns Serving status indicating whether all probes passed.
   */
  public async checkReadiness(): Promise<HealthCheckResponse_ServingStatus> {
    if (this.shuttingDown) {
      return HealthCheckResponse_ServingStatus.NOT_SERVING;
    }

    try {
      const results: GrpcHealthProbeResult[] = await Promise.all(
        this.dependencies.map((dep) => dep.check()),
      );
      const allHealthy = results.every((res) => res.ok);

      if (!allHealthy) {
        const failed = results
          .map((res, index) =>
            !res.ok ? this.dependencies[index]?.name : null,
          )
          .filter((name): name is string => name !== null);
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
   *
   * @param service - Target service name identifier.
   * @returns Serving status or null if unknown service.
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

    return null;
  }

  /**
   * Returns a snapshot of health statuses for all known services.
   *
   * @returns List response mapping service names to serving status.
   */
  public async list(): Promise<HealthListResponse> {
    const liveness = this.shuttingDown
      ? HealthCheckResponse_ServingStatus.NOT_SERVING
      : HealthCheckResponse_ServingStatus.SERVING;
    const readiness = await this.checkReadiness();

    return {
      statuses: {
        "": { status: readiness },
        liveness: { status: liveness },
        readiness: { status: readiness },
      },
    };
  }
}

/**
 * Creates a gRPC health service implementation conforming to standard `grpc.health.v1.Health`.
 *
 * @param options - Configuration options containing probe dependencies.
 * @returns Standard HealthServiceImplementation instance.
 */
export const createGrpcHealthHandler = (
  options: GrpcHealthOptions = {},
): HealthServiceImplementation => {
  const checker = HealthChecker.getInstance(options);

  return {
    async check(request: HealthCheckRequest): Promise<HealthCheckResponse> {
      const status = await checker.check(request.service);

      if (status === null) {
        throw new ServerError(
          Status.NOT_FOUND,
          `Health service '${request.service}' not found.`,
        );
      }

      return { status };
    },

    async list(): Promise<HealthListResponse> {
      return await checker.list();
    },

    async *watch(
      request: HealthCheckRequest,
    ): AsyncIterable<HealthCheckResponse> {
      const serviceName = request.service;
      const initialStatus = await checker.check(serviceName);

      if (initialStatus === null) {
        yield { status: HealthCheckResponse_ServingStatus.SERVICE_UNKNOWN };
      } else {
        yield { status: initialStatus };
      }

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (checker.isShuttingDown()) {
          yield { status: HealthCheckResponse_ServingStatus.NOT_SERVING };
          break;
        }
        const updatedStatus = await checker.check(serviceName);
        if (updatedStatus !== null) {
          yield { status: updatedStatus };
        }
      }
    },
  };
};
