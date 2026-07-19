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
   * Creates a new Schedule in the database.
   *
   * @param data Prisma input data for Schedule creation.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the created Schedule.
   */
  async create(
    data: Prisma.ScheduleUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.schedule.create({ data });
  }

  /**
   * Retrieves a schedule by its ID, loading the associated train, route, station stops, and coach layouts.
   *
   * @param id The unique ID of the schedule.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the schedule with nested snapshots, or null if not found.
   */
  async getById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.schedule.findUnique({
      where: { id },
      include: {
        train: {
          include: {
            route: {
              include: {
                routeStation: {
                  orderBy: { stopNumber: "asc" },
                  include: { station: true },
                },
              },
            },
            coaches: {
              where: { isActive: true },
              include: {
                seats: true,
              },
            },
            operatingDays: true,
          },
        },
      },
    });
  }

  /**
   * Checks if a train has an existing schedule for a specific date (UTC).
   * Used for the trainId + departureDate  unique constraint verification.
   *
   * @param trainId The unique ID of the train.
   * @param departureDate  The departure date.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the schedule if one exists, otherwise null.
   */
  async getByTrainAndDate(
    trainId: string,
    departureDate: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.schedule.findUnique({
      where: {
        trainId_departureDate: {
          trainId,
          departureDate,
        },
      },
    });
  }

  /**
   * Updates an existing schedule's properties (e.g., status).
   *
   * @param id The unique ID of the schedule.
   * @param data The fields to update.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the updated schedule.
   */
  async update(
    id: string,
    data: Prisma.ScheduleUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.schedule.update({
      where: { id },
      data,
    });
  }

  /**
   * Retrieves a list of schedules matching the filters.
   *
   * @param filters Filtering parameters (trainId, status).
   * @param pagination Pagination skip/take values.
   * @returns A promise resolving to an array of schedules.
   */
  async listSchedules(
    filters: {
      trainId?: string | undefined;
      status?: ScheduleStatus | undefined;
    },
    pagination: { skip: number; take: number },
  ) {
    return this.prisma.schedule.findMany({
      where: {
        ...(filters.trainId && { trainId: filters.trainId }),
        ...(filters.status && { status: filters.status }),
      },
      include: {
        train: true,
      },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: {
        departureDate: "asc",
      },
    });
  }

  /**
   * Counts the total number of schedules matching the given filters.
   *
   * @param filters Filtering parameters.
   * @returns A promise resolving to the matching schedule count.
   */
  async countSchedules(filters: {
    trainId?: string | undefined;
    status?: ScheduleStatus | undefined;
  }) {
    return this.prisma.schedule.count({
      where: {
        ...(filters.trainId && { trainId: filters.trainId }),
        ...(filters.status && { status: filters.status }),
      },
    });
  }

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
