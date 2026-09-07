import {
  ValidateBookingResponse_Status,
  type InventoryServiceClient,
} from "@irctc/contracts";
import { mapGrpcClientErrorToApiError } from "@irctc/grpc";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { env } from "@config";

export interface ValidateBookingScheduleParams {
  scheduleId: string;
  fromStationId: string;
  toStationId: string;
  seatIds: string[];
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
   * response into validation metadata (`seatInventoryIds`, `fromSequence`, `toSequence`)
   * or an `ApiError` that surfaces synchronously to the caller.
   *
   * @param params - Schedule validation parameters.
   * @returns Resolved inventory seat IDs and station sequence numbers.
   * @throws {ApiError} 400 if `INVALID_SEAT_IDS` or `INVALID_ROUTE`.
   * @throws {ApiError} 404 if `SCHEDULE_NOT_FOUND`.
   * @throws {ApiError} 409 if `SCHEDULE_INACTIVE`, `TRAIN_ALREADY_DEPARTED`, or `SEAT_UNAVAILABLE`.
   * @throws {ApiError} 503 if inventory-service is unreachable.
   */
  async validateBooking(params: ValidateBookingScheduleParams): Promise<{
    seatInventoryIds: string[];
    fromSequence: number;
    toSequence: number;
  }> {
    let response;
    try {
      response = await this.client.validateBooking(
        {
          scheduleId: params.scheduleId,
          fromStationId: params.fromStationId,
          toStationId: params.toStationId,
          clientRequestedAt: new Date(),
          seatIds: params.seatIds,
        },
        {
          signal: AbortSignal.timeout(env.BOOKING_VALIDATE_DEADLINE_MS),
        },
      );
    } catch (err) {
      throw mapGrpcClientErrorToApiError(
        err,
        "Could not validate booking. Please retry shortly.",
      );
    }

    switch (response.status) {
      case ValidateBookingResponse_Status.OK:
        return {
          seatInventoryIds: response.seatInventoryIds,
          fromSequence: response.fromSequence,
          toSequence: response.toSequence,
        };
      case ValidateBookingResponse_Status.SCHEDULE_NOT_FOUND:
        throw new ApiError(
          statusCode.notFound,
          ERROR_CODES.SCHEDULE_NOT_FOUND,
          "The selected train schedule could not be found.",
        );
      case ValidateBookingResponse_Status.SCHEDULE_INACTIVE:
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.SCHEDULE_INACTIVE,
          "The selected train schedule is no longer accepting bookings.",
        );
      case ValidateBookingResponse_Status.INVALID_ROUTE:
        throw new ApiError(
          statusCode.badRequest,
          ERROR_CODES.INVALID_ROUTE,
          "The requested origin and destination stations are invalid for this train route.",
        );
      case ValidateBookingResponse_Status.TRAIN_ALREADY_DEPARTED:
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.TRAIN_ALREADY_DEPARTED,
          "The train for this schedule has already departed.",
        );
      case ValidateBookingResponse_Status.INVALID_SEAT_IDS:
        throw new ApiError(
          statusCode.badRequest,
          ERROR_CODES.INVALID_SEAT_IDS,
          "One or more selected seats are invalid for this schedule.",
        );
      case ValidateBookingResponse_Status.SEAT_UNAVAILABLE:
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.SEAT_UNAVAILABLE,
          "One or more selected seats are no longer available for this journey.",
        );
      default:
        throw new ApiError(
          statusCode.internalError,
          COMMON_ERROR_CODES.INTERNAL_ERROR,
          "An unexpected error occurred while validating the train schedule.",
        );
    }
  }
}
