import {
  Prisma,
  ScheduleStatus,
  type PrismaClient,
} from "@generated/prisma/client.js";

/**
 * Repository class handling database access and queries for the Schedule model.
 * Utilizes the Prisma Client for type-safe database interactions.
 */
export class ScheduleRepository {
  /**
   * Creates an instance of ScheduleRepository.
   * @param prisma The Prisma client instance.
   */
  constructor(protected readonly prisma: PrismaClient) {}

  /**
   * Retrieves active future schedules for a specific train.
   *
   * @param trainId The unique ID of the train.
   * @param tx Optional active database transaction client.
   * @returns A promise that resolves to an array of active future schedules with their departure dates.
   */
  async getFutureActiveSchedules(
    trainId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.schedule.findMany({
      where: {
        trainId,
        status: ScheduleStatus.ACTIVE,
        departureDate: {
          gte: new Date(),
        },
      },
      select: {
        departureDate: true,
      },
    });
  }
}
