import {
  type GetSeatMapRequest,
  type GetSeatMapResponse,
  type InventoryServiceImplementation,
  type GetSeatDetailsRequest,
  type GetSeatDetailsResponse,
  type GetSeatsDetailsBatchRequest,
  type GetSeatsDetailsBatchResponse,
  type ValidateBookingRequest,
  type ValidateBookingResponse,
} from "@irctc/contracts";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { type SeatAllocationService } from "@services";
import {
  getSeatDetailsRequestSchema,
  getSeatsDetailsBatchRequestSchema,
  getSeatMapRequestSchema,
  validateBookingRequestSchema,
} from "./inventory.schema.js";

/**
 * gRPC Handler implementing InventoryService Implementation for nice-grpc.
 * Strictly adheres to Clean Architecture: delegates database access to SeatAllocationService.
 */
export class InventoryGrpcHandler implements InventoryServiceImplementation {
  /**
   * Initializes InventoryGrpcHandler.
   *
   * @param seatAllocationService - SeatAllocationService domain instance.
   */
  constructor(private readonly seatAllocationService: SeatAllocationService) {}

  /**
   * Handles gRPC `GetSeatDetails` RPC.
   *
   * @param request - GetSeatDetailsRequest payload.
   * @returns GetSeatDetailsResponse payload.
   */
  async getSeatDetails(
    request: GetSeatDetailsRequest,
  ): Promise<GetSeatDetailsResponse> {
    const { scheduleId, seatId } = getSeatDetailsRequestSchema.parse(request);

    const seat = await this.seatAllocationService.getSeatDetails(
      scheduleId,
      seatId,
    );

    if (!seat) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        "Seat inventory record not found for given scheduleId and seatId",
      );
    }

    return seat;
  }

  /**
   * Handles gRPC `GetSeatsDetailsBatch` RPC (single findMany DB query).
   *
   * @param request - GetSeatsDetailsBatchRequest payload.
   * @returns GetSeatsDetailsBatchResponse payload.
   */
  async getSeatsDetailsBatch(
    request: GetSeatsDetailsBatchRequest,
  ): Promise<GetSeatsDetailsBatchResponse> {
    const { scheduleId, seatIds } =
      getSeatsDetailsBatchRequestSchema.parse(request);

    const seats = await this.seatAllocationService.getSeatsDetailsBatch(
      scheduleId,
      seatIds,
    );

    return { seats };
  }

  /**
   * Handles gRPC `GetSeatMap` RPC.
   *
   * @param request - GetSeatMapRequest payload.
   * @returns GetSeatMapResponse payload.
   */
  async getSeatMap(request: GetSeatMapRequest): Promise<GetSeatMapResponse> {
    const { scheduleId, fromStationId, toStationId } =
      getSeatMapRequestSchema.parse(request);

    const result = await this.seatAllocationService.getSeatMapData(
      scheduleId,
      fromStationId,
      toStationId,
    );

    logger.debug(
      { module: "inventory-grpc", scheduleId, fromStationId, toStationId },
      "gRPC getSeatMap received",
    );
    return result;
  }

  /**
   * Handles gRPC `ValidateBooking` pre-flight RPC.
   *
   * @param request - ValidateBookingRequest payload.
   * @returns ValidateBookingResponse payload.
   */
  async validateBooking(
    request: ValidateBookingRequest,
  ): Promise<ValidateBookingResponse> {
    const { scheduleId, fromStationId, toStationId, clientRequestedAt } =
      validateBookingRequestSchema.parse(request);

    const result = await this.seatAllocationService.validateBooking(
      scheduleId,
      fromStationId,
      toStationId,
      clientRequestedAt,
    );

    return result;
  }
}
