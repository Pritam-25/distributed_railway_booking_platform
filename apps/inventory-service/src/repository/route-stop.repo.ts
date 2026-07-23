import {
  type PrismaClient,
  type Prisma,
  type RouteStop,
} from "@generated/prisma/client.js";

/**
 * Repository class handling database operations for the RouteStop model.
 */
export class RouteStopRepository {
  /**
   * Creates an instance of RouteStopRepository.
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
   * Inserts multiple route stops.
   *
   * @param data - Array of route stop inputs.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise that resolves when insertion completes.
   */
  async createMany(
    data: Prisma.RouteStopUncheckedCreateInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.getClient(tx).routeStop.createMany({ data });
  }

  /**
   * Retrieves all route stops for a given schedule, ordered by their sequence number.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the array of route stops.
   */
  async getBySchedule(
    scheduleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RouteStop[]> {
    return this.getClient(tx).routeStop.findMany({
      where: { scheduleId },
      orderBy: { sequenceNumber: "asc" },
    });
  }

  /**
   * Retrieves a specific route stop by schedule ID and station ID.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param stationId - The unique ID of the station.
   * @param tx - Optional Prisma transaction client.
   * @returns A promise resolving to the route stop or null if not found.
   */
  async findByScheduleAndStation(
    scheduleId: string,
    stationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RouteStop | null> {
    return this.getClient(tx).routeStop.findUnique({
      where: {
        scheduleId_stationId: {
          scheduleId,
          stationId,
        },
      },
    });
  }
}
