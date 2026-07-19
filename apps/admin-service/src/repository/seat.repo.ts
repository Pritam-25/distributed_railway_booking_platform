import { Prisma, type PrismaClient } from "@generated/prisma/client.js";

/**
 * Repository class handling database access and bulk operations for the Seat model.
 */
export class SeatRepository {
  /**
   * Creates an instance of SeatRepository.
   *
   * @param prisma The Prisma Client instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Bulk creates a list of seats inside a database transaction or using the standard client.
   *
   * @param seats An array of seat creation input payloads.
   * @param tx Optional transaction client context.
   * @returns A promise that resolves to the count of created seat records.
   */
  async bulkCreate(
    seats: Prisma.SeatCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.seat.createMany({
      data: seats,
    });
  }

  /**
   * Counts the number of seats registered inside a specific coach.
   *
   * @param coachId The unique ID of the coach.
   * @param tx Optional transaction client context.
   * @returns A promise resolving to the total seats count.
   */
  async countSeatsByCoachId(coachId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.seat.count({
      where: { coachId },
    });
  }

  /**
   * Lists all seats inside a coach, ordered chronologically or logically by seat number.
   *
   * @param coachId The unique ID of the coach.
   * @returns A promise resolving to an array of seat records.
   */
  async listSeatsByCoachId(coachId: string) {
    return this.prisma.seat.findMany({
      where: { coachId },
      orderBy: { seatNumber: "asc" },
    });
  }

  /**
   * Fetches a seat by its unique database ID.
   *
   * @param id The unique ID of the seat.
   * @returns A promise resolving to the seat record or null if not found.
   */
  async getSeatById(id: string) {
    return this.prisma.seat.findUnique({
      where: { id },
    });
  }

  /**
   * Bulk deletes all seats belonging to a specific coach.
   *
   * @param coachId The unique ID of the coach.
   * @param tx Optional transaction client context.
   * @returns A promise resolving to the delete result count.
   */
  async deleteSeatsByCoachId(coachId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.seat.deleteMany({
      where: { coachId },
    });
  }
}
