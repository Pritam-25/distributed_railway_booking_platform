import {
  type Prisma,
  type PrismaClient,
  type ScheduleInventory,
  ScheduleInventoryStatus,
} from "@generated/prisma/client.js";

/**
 * Repository class handling database operations for the ScheduleInventory model.
 */
export class ScheduleInventoryRepository {
  /**
   * Creates an instance of ScheduleInventoryRepository.
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
   * Retrieves a schedule inventory record's version by its unique schedule ID.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the schedule inventory's version, or null if not found.
   */
  async findByScheduleId(scheduleId: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).scheduleInventory.findUnique({
      where: { scheduleId },
      select: { version: true },
    });
  }

  /**
   * Creates a new schedule inventory record in the database.
   *
   * @param data - The unchecked create input for the schedule inventory.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the newly created schedule inventory record.
   */
  async create(
    data: Prisma.ScheduleInventoryUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ScheduleInventory> {
    return this.getClient(tx).scheduleInventory.create({
      data,
    });
  }

  /**
   * Updates the status and version of a schedule inventory record.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param status - The new status of the schedule inventory.
   * @param version - The new version of the schedule inventory.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the updated schedule inventory record.
   */
  async updateStatus(
    scheduleId: string,
    status: ScheduleInventoryStatus,
    version: number,
    tx?: Prisma.TransactionClient,
  ): Promise<ScheduleInventory> {
    return this.getClient(tx).scheduleInventory.update({
      where: { scheduleId },
      data: {
        status,
        version,
      },
    });
  }

  /**
   * Deletes a schedule inventory record and its associated stops/seats (via cascade).
   *
   * @param scheduleId - The unique ID of the schedule to delete.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise that resolves when the deletion is complete.
   */
  async deleteByScheduleId(
    scheduleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.getClient(tx).scheduleInventory.delete({
      where: { scheduleId },
    });
  }
}
