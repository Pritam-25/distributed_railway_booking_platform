import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import type { PaginationOptions } from "@irctc/http";

/**
 * Repository class handling database access and CRUD operations for the Route and RouteStation models.
 * Utilizes the Prisma Client for type-safe database interactions and ensures station stops are ordered by sequence.
 */
export class RouteRepository {
  /**
   * Creates an instance of RouteRepository.
   *
   * @param prisma The Prisma Client instance used for database operations.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves a route by its unique ID.
   * Always includes station stops ordered by stopNumber ascending.
   *
   * @param id The unique ID of the route.
   * @param includeInactive If true, retrieves the route even if it is deactivated/soft-deleted.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the route record with stops, or null if not found.
   */
  async getRouteById(
    id: string,
    includeInactive = false,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.route.findFirst({
      where: {
        id,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        routeStation: {
          orderBy: {
            stopNumber: "asc",
          },
          include: {
            station: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves a route by the associated Train ID.
   *
   * @param trainId The unique ID of the train.
   * @param includeInactive If true, retrieves the route even if deactivated.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the route record with stops, or null if not found.
   */
  async getRouteByTrainId(
    trainId: string,
    includeInactive = false,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.route.findFirst({
      where: {
        trainId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        routeStation: {
          orderBy: {
            stopNumber: "asc",
          },
          include: {
            station: true,
          },
        },
      },
    });
  }

  /**
   * Creates a new Route shell associated with a train.
   *
   * @param data The route creation payload.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the created route.
   */
  async createRoute(
    data: Prisma.RouteUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.route.create({
      data,
    });
  }

  /**
   * Updates an existing Route's fields.
   *
   * @param id The unique ID of the route.
   * @param data The fields to update.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the updated route.
   */
  async updateRoute(
    id: string,
    data: Prisma.RouteUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.route.update({
      where: { id },
      data,
    });
  }

  /**
   * Retrieves a paginated list of routes.
   *
   * @param pagination The pagination parameters (skip, take).
   * @param includeInactive If true, includes deactivated routes in the list.
   * @returns A promise resolving to an array of route records.
   */
  async listRoutes(pagination: PaginationOptions, includeInactive = false) {
    return this.prisma.route.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        routeStation: {
          orderBy: {
            stopNumber: "asc",
          },
          include: {
            station: true,
          },
        },
      },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Counts the total number of routes in the system.
   *
   * @param includeInactive If true, counts deactivated routes as well.
   * @returns A promise resolving to the total route count.
   */
  async countRoutes(includeInactive = false) {
    return this.prisma.route.count({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
      },
    });
  }

  /**
   * Adds a new station stop to a route.
   *
   * @param data The station stop creation details.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the created RouteStation stop.
   */
  async addRouteStation(
    data: Prisma.RouteStationUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.routeStation.create({
      data,
      include: {
        station: true,
      },
    });
  }

  /**
   * Retrieves a specific route station stop by its unique ID.
   *
   * @param routeStationId The unique ID of the RouteStation stop.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the stop record, or null if not found.
   */
  async getRouteStationById(
    routeStationId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.routeStation.findUnique({
      where: { id: routeStationId },
      include: {
        station: true,
      },
    });
  }

  /**
   * Retrieves a specific stop by its stop number within a route.
   *
   * @param routeId The unique ID of the route.
   * @param stopNumber The sequence position number.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the stop record if found, or null.
   */
  async getRouteStationByStopNumber(
    routeId: string,
    stopNumber: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.routeStation.findFirst({
      where: { routeId, stopNumber },
      include: {
        station: true,
      },
    });
  }

  /**
   * Retrieves a specific stop by its station ID within a route (to check for duplicates).
   *
   * @param routeId The unique ID of the route.
   * @param stationId The unique ID of the station.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the stop record if found, or null.
   */
  async getRouteStationByStationId(
    routeId: string,
    stationId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.routeStation.findFirst({
      where: { routeId, stationId },
      include: {
        station: true,
      },
    });
  }

  /**
   * Updates an existing route station stop.
   *
   * @param routeStationId The unique ID of the RouteStation stop.
   * @param data The fields to update.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the updated stop.
   */
  async updateRouteStation(
    routeStationId: string,
    data: Prisma.RouteStationUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.routeStation.update({
      where: { id: routeStationId },
      data,
      include: {
        station: true,
      },
    });
  }

  /**
   * Physically deletes a route station stop from a route (hard delete).
   *
   * @param routeStationId The unique ID of the RouteStation stop to delete.
   * @param tx Optional active Prisma transaction client.
   * @returns A promise resolving to the deleted stop.
   */
  async deleteRouteStation(
    routeStationId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.routeStation.delete({
      where: { id: routeStationId },
      include: {
        station: true,
      },
    });
  }
}
