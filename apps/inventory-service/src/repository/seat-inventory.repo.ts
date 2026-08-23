import {
  type PrismaClient,
  type Prisma,
  type SeatInventory,
} from "@generated/prisma/client.js";

/**
 * Repository class handling database operations for the SeatInventory model.
 */
export class SeatInventoryRepository {
  /**
   * Creates an instance of SeatInventoryRepository.
   *
   * @param prisma - PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Helper method to get the correct prisma database client (either transactional or default client).
   *
   * @param tx - Optional Prisma transaction client.
   * @returns The active transaction client or general prisma client.
   */
  private getClient(tx?: Prisma.TransactionClient) {
    return tx || this.prisma;
  }

  /**
   * Inserts multiple seat inventory records.
   *
   * @param data - Array of seat inventory inputs.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise that resolves when insertion completes.
   */
  async createMany(
    data: Prisma.SeatInventoryUncheckedCreateInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.getClient(tx).seatInventory.createMany({ data });
  }

  /**
   * Retrieves all seat inventory records for a given schedule.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the array of seat inventories.
   */
  async getBySchedule(
    scheduleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SeatInventory[]> {
    return this.getClient(tx).seatInventory.findMany({
      where: { scheduleId },
    });
  }

  /**
   * Retrieves seat inventory records for specific seat IDs within a schedule.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param seatIds - Array of seat IDs.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the matching seat inventory records.
   */
  async findByScheduleAndSeats(
    scheduleId: string,
    seatIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<SeatInventory[]> {
    return this.getClient(tx).seatInventory.findMany({
      where: {
        scheduleId,
        seatId: { in: seatIds },
      },
    });
  }

  /**
   * Retrieves seat inventory records by schedule ID and seat inventory IDs.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param ids - Array of seat inventory record IDs.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the matching seat inventory records.
   */
  async findManyByIds(
    scheduleId: string,
    ids: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<SeatInventory[]> {
    return this.getClient(tx).seatInventory.findMany({
      where: {
        scheduleId,
        id: { in: ids },
      },
    });
  }

  /**
   * Performs SELECT ... FOR UPDATE row-level locking on seat inventory records.
   *
   * @param ids - Array of seat inventory record IDs to lock.
   * @param tx - Active Prisma transaction client.
   */
  async lockSeats(ids: string[], tx: Prisma.TransactionClient): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    await tx.$executeRawUnsafe(
      `SELECT id FROM seat_inventory WHERE id IN (${placeholders}) FOR UPDATE`,
      ...ids,
    );
  }

  /**
   * Retrieves single seat inventory record by schedule ID and seat ID.
   *
   * @param scheduleId - Schedule UUID.
   * @param seatId - Seat UUID.
   * @param tx - Optional Prisma transaction client.
   */
  async findByScheduleAndSeatId(
    scheduleId: string,
    seatId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SeatInventory | null> {
    return this.getClient(tx).seatInventory.findUnique({
      where: { scheduleId_seatId: { scheduleId, seatId } },
    });
  }

  /**
   * Retrieves all seats for a schedule ordered by coachNumber and seatNumber.
   *
   * @param scheduleId - Schedule UUID.
   * @param tx - Optional Prisma transaction client.
   */
  async getByScheduleOrdered(
    scheduleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SeatInventory[]> {
    return this.getClient(tx).seatInventory.findMany({
      where: { scheduleId },
      orderBy: [{ coachNumber: "asc" }, { seatNumber: "asc" }],
    });
  }
}
