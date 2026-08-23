import {
  type GetSeatMapRequest,
  type GetSeatMapResponse,
  type InventoryServiceClient,
} from "@irctc/contracts";
import {
  mapGrpcClientErrorToApiError,
  createRpcMetadata,
  type Metadata,
} from "@irctc/grpc";

/**
 * Adapter wrapping the low-level Inventory gRPC client for search-service.
 * Translates gRPC responses and transport errors into application-level ApiErrors.
 */
export class InventoryAdapter {
  /**
   * Creates an instance of InventoryAdapter.
   *
   * @param client - Inventory gRPC client instance.
   */
  constructor(private readonly client: InventoryServiceClient) {}

  /**
   * Fetches the full seat-map from inventory-service for a (scheduleId, fromStationId, toStationId) segment.
   *
   * @param request - GetSeatMapRequest payload.
   * @param headers - Optional HTTP headers to propagate as gRPC metadata.
   * @returns GetSeatMapResponse payload.
   * @throws {ApiError} 503/404 if inventory-service is unreachable or errors occur.
   */
  async getSeatMap(
    request: GetSeatMapRequest,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<GetSeatMapResponse> {
    try {
      let metadata: Metadata | undefined;
      if (headers) {
        const flatHeaders: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(headers)) {
          if (v !== undefined) {
            flatHeaders[k] = Array.isArray(v) ? v.join(",") : v;
          }
        }
        metadata = createRpcMetadata(flatHeaders);
      }

      return await this.client.getSeatMap(
        request,
        metadata ? { metadata } : {},
      );
    } catch (err) {
      throw mapGrpcClientErrorToApiError(
        err,
        "Failed to fetch seat map from inventory service.",
      );
    }
  }
}
