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
}
