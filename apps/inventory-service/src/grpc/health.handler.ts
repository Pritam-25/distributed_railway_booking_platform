import { ServerError, Status } from "nice-grpc";
import {
  HealthCheckResponse_ServingStatus,
  type HealthCheckRequest,
  type HealthCheckResponse,
  type HealthListResponse,
  type HealthServiceImplementation,
} from "@irctc/contracts";
import { HealthChecker } from "./health.service.js";

export const healthHandler: HealthServiceImplementation = {
  async check(request: HealthCheckRequest): Promise<HealthCheckResponse> {
    const checker = HealthChecker.getInstance();
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
    const checker = HealthChecker.getInstance();
    return await checker.list();
  },

  async *watch(
    request: HealthCheckRequest,
  ): AsyncIterable<HealthCheckResponse> {
    const checker = HealthChecker.getInstance();
    const serviceName = request.service;

    const initialStatus = await checker.check(serviceName);

    if (initialStatus === null) {
      // Per canonical spec: If service is unknown, send SERVICE_UNKNOWN but do NOT terminate call.
      yield { status: HealthCheckResponse_ServingStatus.SERVICE_UNKNOWN };
    } else {
      yield { status: initialStatus };
    }

    // Keep the watch stream open until cancelled by client.
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
