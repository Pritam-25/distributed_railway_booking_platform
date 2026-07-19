import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import type { PaginationOptions } from "@irctc/http";
import type { StationFilters } from "@dto";

/**
 * Repository class handling database access and CRUD operations for the Station model.
 * Utilizes the Prisma Client for type-safe database interactions.
 */
export class StationRepository {
  /**
   * Creates an instance of StationRepository.
   *
   * @param prisma The Prisma Client instance used for database operations.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves a station by its unique alphabetic code (e.g., "NDLS").
   *
   * @param code The unique code of the station to fetch.
   * @returns A promise that resolves to the station database record, or null if not found.
   */
  async getStationByCode(code: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.station.findFirst({
      where: { code, isActive: true },
    });
  }

  /**
   * Fetches a station by its unique ID.
   * @param id - The unique ID of the station
   * @returns The station record if found, otherwise null
   */
  async getStationById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.station.findFirst({
      where: { id, isActive: true },
    });
  }

  /**
   * Creates a new station record in the database.
   * Can optionally run within an active database transaction context.
   *
   * @param data The input data used to create the station record.
   * @param tx Optional active Prisma transaction client to execute the creation operation within.
   * @returns A promise that resolves to the newly created station record.
   */
  async create(data: Prisma.StationCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.station.create({ data });
  }

  /**
   * Updates an existing station record by its ID.
   * Can optionally run within an active database transaction context.
   *
   * @param id The unique ID of the station to update.
   * @param data The updated data fields.
   * @param tx Optional active Prisma transaction client to execute the update within.
   * @returns A promise that resolves to the updated station record.
   */
  async update(
    id: string,
    data: Prisma.StationUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.station.update({
      where: { id },
      data,
    });
  }

  /**
   * Helper method to build a Prisma where clause filter object from StationFilters.
   * Performs case-insensitive matching for string fields (code, zone, state).
   *
   * @param filters The filtering criteria.
   * @returns A Prisma StationWhereInput filter object.
   */
  private buildWhereClause(filters: StationFilters): Prisma.StationWhereInput {
    return {
      ...(filters.code && {
        code: { contains: filters.code, mode: "insensitive" },
      }),
      ...(filters.zone && {
        zone: { contains: filters.zone, mode: "insensitive" },
      }),
      ...(filters.state && {
        state: { contains: filters.state, mode: "insensitive" },
      }),
      isActive: filters.isActive !== undefined ? filters.isActive : true,
    };
  }

  /**
   * Retrieves a list of stations matching the provided filters and pagination options.
   *
   * @param filters The filtering criteria to apply.
   * @param pagination The pagination parameters (skip, take).
   * @returns A promise that resolves to an array of station records.
   */
  async listStations(filters: StationFilters, pagination: PaginationOptions) {
    const where = this.buildWhereClause(filters);
    return this.prisma.station.findMany({
      where,
      orderBy: { code: "asc" },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  /**
   * Counts the total number of stations matching the given filter criteria.
   *
   * @param filters The filtering criteria to apply.
   * @returns A promise that resolves to the matching station count.
   */
  async countStations(filters: StationFilters) {
    const where = this.buildWhereClause(filters);
    return this.prisma.station.count({ where });
  }
}
