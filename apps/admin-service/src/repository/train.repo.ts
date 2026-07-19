import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import type { TrainFilters } from "@dto";
import type { PaginationOptions } from "@irctc/http";

/**
 * Repository class handling database access and CRUD operations for the Train model.
 * Utilizes the Prisma Client for type-safe database interactions.
 */
export class TrainRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves a train by its unique train number (e.g., "12345").
   *
   * @param trainNumber The unique number of the train to fetch.
   * @returns A promise that resolves to the train database record, or null if not found.
   */
  async getTrainByNumber(trainNumber: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.train.findFirst({
      where: { trainNumber, isActive: true },
    });
  }

  /**
   * Fetches a train by its unique ID.
   * @param id - The unique ID of the train
   * @returns The train record if found, otherwise null
   */
  async getTrainById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.train.findFirst({
      where: { id, isActive: true },
      include: { operatingDays: true },
    });
  }

  /**
   * Creates a new train record in the database.
   * Can optionally run within an active database transaction context.
   *
   * @param data The input data used to create the train record.
   * @param tx Optional active Prisma transaction client to execute the creation operation within.
   * @returns A promise that resolves to the newly created train record.
   */
  async create(data: Prisma.TrainCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.train.create({ data });
  }

  /**
   * Updates an existing train record by its ID.
   * Can optionally run within an active database transaction context.
   *
   * @param id The unique ID of the train to update.
   * @param data The updated data fields.
   * @param tx Optional active Prisma transaction client to execute the update within.
   * @returns A promise that resolves to the updated train record.
   */
  async update(
    id: string,
    data: Prisma.TrainUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.train.update({
      where: { id },
      data,
    });
  }

  /**
   * Re-sets the operating days of a train inside a transaction context.
   *
   * @param trainId The unique ID of the train.
   * @param days Array of integers representing days of the week (0-6).
   * @param tx Prisma transaction client.
   */
  async updateOperatingDays(
    trainId: string,
    days: number[],
    tx: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    // Delete existing operating days
    await client.operatingDay.deleteMany({
      where: { trainId },
    });

    // Insert new operating days
    await client.operatingDay.createMany({
      data: days.map((dayOfWeek) => ({
        trainId,
        dayOfWeek,
      })),
    });
  }

  /**
   * Helper method to build a Prisma where clause filter object from TrainFilters.
   * Performs exact matching for fields (trainNumber, category).
   *
   * @param filters The filtering criteria.
   * @returns A Prisma TrainWhereInput filter object.
   */
  private buildWhereClause(filters: TrainFilters): Prisma.TrainWhereInput {
    return {
      ...(filters.trainNumber && {
        trainNumber: filters.trainNumber,
      }),
      ...(filters.category && {
        category: filters.category,
      }),
      isActive: filters.isActive ?? true,
    };
  }

  /**
   * Retrieves a list of trains matching the provided filters and pagination options.
   *
   * @param filters The filtering criteria to apply.
   * @param pagination The pagination parameters (skip, take).
   * @returns A promise that resolves to an array of train records.
   */
  async listTrains(filters: TrainFilters, pagination: PaginationOptions) {
    const where = this.buildWhereClause(filters);
    return this.prisma.train.findMany({
      where,
      orderBy: { trainNumber: "asc" },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  /**
   * Counts the total number of trains matching the given filter criteria.
   *
   * @param filters The filtering criteria to apply.
   * @returns A promise that resolves to the matching train count.
   */
  async countTrains(filters: TrainFilters) {
    const where = this.buildWhereClause(filters);
    return this.prisma.train.count({ where });
  }
}
