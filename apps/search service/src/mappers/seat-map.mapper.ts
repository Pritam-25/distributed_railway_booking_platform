import type { GetSeatMapResponse as GrpcGetSeatMapResponse } from "@irctc/contracts";
import type { SeatMapResponseDto } from "@dto";

/**
 * ## SeatMapMapper
 *
 * Pure mapper class for converting successful gRPC response payloads from
 * inventory-service into public REST API data transfer objects (SeatMapResponseDto).
 */
export class SeatMapMapper {
  /**
   * Maps a successful gRPC response payload to a public {@link SeatMapResponseDto}.
   *
   * @param grpcResponse - Raw response from inventory-service gRPC call.
   * @returns Formatted {@link SeatMapResponseDto}.
   */
  static toResponseDto(
    grpcResponse: GrpcGetSeatMapResponse,
  ): SeatMapResponseDto {
    return {
      status: "OK",
      coaches: grpcResponse.coaches.map((coach) => ({
        coachId: coach.coachId,
        coachNumber: coach.coachNumber,
        coachType: coach.coachType,
        totalSeats: coach.totalSeats,
        seats: coach.seats.map((seat) => ({
          seatId: seat.seatId,
          seatNumber: seat.seatNumber,
          seatType: seat.seatType,
          berthType: seat.berthType,
          price: seat.price,
          isBooked: seat.isBooked,
          quota: seat.quota,
          status: seat.status || (seat.isBooked ? "BOOKED" : "AVAILABLE"),
        })),
      })),
    };
  }
}
