import {
  type GetSeatMapRequest,
  type GetSeatMapResponse,
  type InventoryServiceImplementation,
  type ValidateBookingRequest,
  type ValidateBookingResponse,
} from "@irctc/contracts";
import { type SeatAllocationService } from "@services";
import {
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
    const {
      scheduleId,
      fromStationId,
      toStationId,
      clientRequestedAt,
      seatIds,
    } = validateBookingRequestSchema.parse(request);

    const result = await this.seatAllocationService.validateBooking(
      scheduleId,
      fromStationId,
      toStationId,
      seatIds,
      clientRequestedAt,
    );

    return result;
  }
}
