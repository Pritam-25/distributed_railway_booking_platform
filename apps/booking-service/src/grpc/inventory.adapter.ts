import { type InventoryServiceClient } from "@irctc/contracts";
import { mapGrpcClientErrorToApiError } from "@irctc/grpc";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";

export interface ValidateBookingScheduleParams {
  scheduleId: string;
  fromStationId: string;
  toStationId: string;
}

/**
 * Adapter wrapping the low-level Inventory gRPC client.
 * Translates gRPC responses and transport errors into application-level ApiErrors.
 */
export class InventoryAdapter {
  /**
   * Creates an instance of InventoryAdapter.
   *
   * @param client - Inventory gRPC client.
   */
  constructor(private readonly client: InventoryServiceClient) {}

  /**
   * Calls `inventory.ValidateBooking` over gRPC and translates the
   * response into either a no-op (`OK`) or an `ApiError` that surfaces
   * synchronously to the caller.
   *
   * @param params - Schedule validation parameters.
   * @throws {ApiError} 404 if `SCHEDULE_NOT_FOUND`.
   * @throws {ApiError} 409 if `SCHEDULE_INACTIVE` or `TRAIN_ALREADY_DEPARTED`.
   * @throws {ApiError} 503 if inventory-service is unreachable.
   */
  async validateBooking(params: ValidateBookingScheduleParams): Promise<void> {
    let response;
    try {
      response = await this.client.validateBooking({
        scheduleId: params.scheduleId,
        fromStationId: params.fromStationId,
        toStationId: params.toStationId,
        clientRequestedAt: new Date(),
      });
    } catch (err) {
      throw mapGrpcClientErrorToApiError(
        err,
        "Could not validate booking schedule. Please retry shortly.",
      );
    }

    switch (response.status) {
      case "OK":
        return;
      case "SCHEDULE_NOT_FOUND":
        throw new ApiError(
          statusCode.notFound,
          ERROR_CODES.SCHEDULE_NOT_FOUND,
          "The selected train schedule could not be found.",
        );
      case "SCHEDULE_INACTIVE":
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.SCHEDULE_INACTIVE,
          "The selected train schedule is no longer accepting bookings.",
        );
      case "TRAIN_ALREADY_DEPARTED":
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.TRAIN_ALREADY_DEPARTED,
          "The train for this schedule has already departed.",
        );
      default:
        throw new ApiError(
          statusCode.internalError,
          COMMON_ERROR_CODES.INTERNAL_ERROR,
          "An unexpected error occurred while validating the train schedule.",
        );
    }
  }

  /**
   * Resolves booking-side `seatId` values (the public UUIDs the user
   * sees) to inventory-side `seatInventoryId` row IDs via per-seat
   * `GetSeatDetails` gRPC calls in parallel.
   *
   * @param scheduleId - The schedule UUID the seats belong to.
   * @param seatIds - Booking-side seat UUIDs from the request DTO.
   * @returns Inventory-side `seatInventoryId` values, one per input.
   * @throws {ApiError} 404 if any seat cannot be resolved.
   * @throws {ApiError} 503 if inventory-service is unreachable.
   */
  async resolveSeatInventoryIds(
    scheduleId: string,
    seatIds: string[],
  ): Promise<string[]> {
    const results = await Promise.allSettled(
      seatIds.map((seatId) =>
        this.client.getSeatDetails({ scheduleId, seatId }),
      ),
    );

    return results.map((r, i) => {
      if (r.status === "fulfilled") {
        return r.value.seatInventoryId;
      }
      // Inventory threw — translate to ApiError for the caller.
      throw mapGrpcClientErrorToApiError(
        r.reason,
        `One of the selected seats could not be found or validated (${seatIds[i]}).`,
      );
    });
  }
}
