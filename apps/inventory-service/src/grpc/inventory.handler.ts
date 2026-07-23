import {
  type InventoryServiceImplementation,
  type GetSeatDetailsRequest,
  type GetSeatDetailsResponse,
} from "@irctc/contracts";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { prisma } from "@config";
import { statusCode } from "@irctc/http";

/**
 * gRPC Handler implementing InventoryService Implementation for nice-grpc.
 * Throws domain ApiErrors which are automatically translated by server middleware.
 */
export const inventoryHandler: InventoryServiceImplementation = {
  async getSeatDetails(
    request: GetSeatDetailsRequest,
  ): Promise<GetSeatDetailsResponse> {
    const { scheduleId, seatId } = request;

    if (!scheduleId || !seatId) {
      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.BAD_REQUEST,
        "Both scheduleId and seatId are required.",
      );
    }

    const seat = await prisma.seatInventory.findUnique({
      where: {
        scheduleId_seatId: {
          scheduleId,
          seatId,
        },
      },
    });

    if (!seat) {
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.NOT_FOUND,
        `Seat inventory record not found for scheduleId=${scheduleId}, seatId=${seatId}`,
      );
    }

    return {
      scheduleId: seat.scheduleId,
      seatId: seat.seatId,
      trainId: seat.trainId,
      coachId: seat.coachId,
      coachNumber: seat.coachNumber,
      seatNumber: seat.seatNumber,
      seatType: seat.seatType,
      pricePerKm: Number(seat.pricePerKm),
      version: seat.version,
    };
  },
};
