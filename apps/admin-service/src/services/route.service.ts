import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { statusCode } from "@irctc/http";
import type {
  RouteRepository,
  TrainRepository,
  StationRepository,
} from "@repository";
import { type OutboxRepository } from "@irctc/kafka";
import type {
  CreateRouteRequestDto,
  AddStationToRouteRequestDto,
  UpdateRouteStationRequestDto,
  ListRoutesQueryDto,
} from "@dto";
import { RouteEventMapper } from "@mappers";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { EVENT_TYPES, KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Service class handling train route configuration, station stop sequence management,
 * and Kafka synchronization event orchestration.
 */
export class RouteService {
  /**
   * Creates an instance of RouteService.
   *
   * @param prisma The Prisma Client instance for transactional safety orchestration.
   * @param routeRepository The repository managing database route and stop changes.
   * @param trainRepository The repository validating train entity existence.
   * @param stationRepository The repository validating station entity existence.
   * @param outboxRepository The repository storing transactional outbox event logs.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly routeRepository: RouteRepository,
    private readonly trainRepository: TrainRepository,
    private readonly stationRepository: StationRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Abstraction guard validating if a route can be safely deactivated or deleted.
   * Throws 409 Conflict if schedules reference this route.
   *
   * @param routeId The unique ID of the route.
   */
  private async ensureRouteCanBeDeleted(
    routeId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const route = await this.routeRepository.getRouteById(routeId, true, tx);
    if (!route) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
    }

    const count = await client.schedule.count({
      where: {
        trainId: route.trainId,
        status: "ACTIVE",
        departureDate: {
          gte: new Date(),
        },
      },
    });

    if (count > 0) {
      throw new ApiError(
        statusCode.conflict,
        ERROR_CODES.ROUTE_REFERENCED_BY_SCHEDULES,
      );
    }
  }

  /**
   * Creates a new Route shell for a train.
   *
   * @param dto CreateRouteRequestDto containing the target Train ID.
   * @throws {ApiError} If train is not found, or if train already has a route.
   * @returns A promise resolving to the created route.
   */
  async createRoute(dto: CreateRouteRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      // Validate train exists and is active
      const train = await this.trainRepository.getTrainById(dto.trainId, tx);
      if (!train) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
      }

      // Enforce route uniqueness per train
      const existingRoute = await this.routeRepository.getRouteByTrainId(
        dto.trainId,
        true,
        tx,
      );
      if (existingRoute) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.ROUTE_ALREADY_EXISTS,
        );
      }

      const route = await this.routeRepository.createRoute(
        {
          trainId: dto.trainId,
          isActive: true,
        },
        tx,
      );

      await this.outboxRepository.insert(tx, {
        aggregateType: "ROUTE",
        aggregateId: route.id,
        eventType: EVENT_TYPES.ROUTE_CREATED,
        topic: KAFKA_TOPICS.ROUTE_CREATED,
        payload: RouteEventMapper.toCreatedEvent(route),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.ROUTE_CREATED,
        },
      });

      return route;
    });
  }

  /**
   * Retrieves a route by its ID, returning ordered station stops.
   *
   * @param routeId The route unique ID.
   * @throws {ApiError} If route is not found.
   * @returns A promise resolving to the route with stops.
   */
  async getRoute(routeId: string) {
    const route = await this.routeRepository.getRouteById(routeId, true);
    if (!route) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
    }
    return route;
  }

  /**
   * Retrieves a paginated list of routes.
   *
   * @param query Pagination queries.
   * @returns A promise resolving to routes list with pagination metadata.
   */
  async listRoutes(query: ListRoutesQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.routeRepository.listRoutes({ skip, take: limit }, true),
      this.routeRepository.countRoutes(true),
    ]);

    return {
      data,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Adds a new station stop to a route.
   * Enforces stop position uniqueness (no auto-shifting, throws 409) and duplicate stop prevention.
   *
   * @param routeId The target Route ID.
   * @param dto AddStationToRouteRequestDto containing station details.
   * @throws {ApiError} If route/station not found, station is duplicate, or stopNumber conflicts.
   * @returns A promise resolving to the created stop.
   */
  async addStationToRoute(routeId: string, dto: AddStationToRouteRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      // Validate Route exists
      const route = await this.routeRepository.getRouteById(routeId, true, tx);
      if (!route) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
      }

      // Validate Station exists and is active
      const station = await this.stationRepository.getStationById(
        dto.stationId,
        tx,
      );
      if (!station) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.STATION_NOT_FOUND);
      }

      // Validate station duplicate inside route
      const duplicateStation =
        await this.routeRepository.getRouteStationByStationId(
          routeId,
          dto.stationId,
          tx,
        );
      if (duplicateStation) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.STATION_ALREADY_ON_ROUTE,
        );
      }

      // Validate stop number uniqueness (no auto-shifting, throw 409 Conflict)
      const duplicateStop =
        await this.routeRepository.getRouteStationByStopNumber(
          routeId,
          dto.stopNumber,
          tx,
        );
      if (duplicateStop) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.STOP_NUMBER_CONFLICT,
        );
      }

      const stop = await this.routeRepository.addRouteStation(
        {
          routeId,
          stationId: dto.stationId,
          stopNumber: dto.stopNumber,
          arrivalMinutes: dto.arrivalMinutes ?? null,
          departureMinutes: dto.departureMinutes ?? null,
          distanceFromStart: dto.distanceFromStart,
          platformNumber: dto.platformNumber ?? null,
        },
        tx,
      );

      await this.outboxRepository.insert(tx, {
        aggregateType: "ROUTE_STATION",
        aggregateId: stop.id,
        eventType: EVENT_TYPES.ROUTE_STATION_ADDED,
        topic: KAFKA_TOPICS.ROUTE_STATION_ADDED,
        payload: RouteEventMapper.toStationAddedEvent(route.trainId, stop),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.ROUTE_STATION_ADDED,
        },
      });

      return stop;
    });
  }

  /**
   * Updates an existing route station stop.
   *
   * @param routeStationId The RouteStation stop ID.
   * @param dto UpdateRouteStationRequestDto partial updates.
   * @throws {ApiError} If stop is not found.
   * @returns A promise resolving to the updated stop.
   */
  async updateRouteStation(
    routeStationId: string,
    dto: UpdateRouteStationRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const stop = await this.routeRepository.getRouteStationById(
        routeStationId,
        tx,
      );
      if (!stop) {
        throw new ApiError(
          statusCode.notFound,
          ERROR_CODES.ROUTE_STATION_NOT_FOUND,
        );
      }

      const route = await this.routeRepository.getRouteById(
        stop.routeId,
        true,
        tx,
      );
      if (!route) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
      }

      const updatedData = Object.fromEntries(
        Object.entries(dto).filter(([_, value]) => value !== undefined),
      );

      const updatedStop = await this.routeRepository.updateRouteStation(
        routeStationId,
        updatedData,
        tx,
      );

      await this.outboxRepository.insert(tx, {
        aggregateType: "ROUTE_STATION",
        aggregateId: updatedStop.id,
        eventType: EVENT_TYPES.ROUTE_STATION_UPDATED,
        topic: KAFKA_TOPICS.ROUTE_STATION_UPDATED,
        payload: RouteEventMapper.toStationUpdatedEvent(
          route.trainId,
          updatedStop,
        ),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.ROUTE_STATION_UPDATED,
        },
      });

      return updatedStop;
    });
  }

  /**
   * Removes a station stop from a route (hard delete).
   * Prevents removal if the route is left with fewer than 2 stops.
   *
   * @param routeStationId The RouteStation stop ID to remove.
   * @throws {ApiError} If stop is not found, or route would have fewer than 2 stations.
   */
  async removeRouteStation(routeStationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const stop = await this.routeRepository.getRouteStationById(
        routeStationId,
        tx,
      );
      if (!stop) {
        throw new ApiError(
          statusCode.notFound,
          ERROR_CODES.ROUTE_STATION_NOT_FOUND,
        );
      }

      const route = await this.routeRepository.getRouteById(
        stop.routeId,
        true,
        tx,
      );
      if (!route) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
      }

      // A route must contain at least 2 stations (source and destination)
      if (route.routeStation.length <= 2) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.ROUTE_MIN_STATIONS_REQUIRED,
        );
      }

      await this.routeRepository.deleteRouteStation(routeStationId, tx);

      await this.outboxRepository.insert(tx, {
        aggregateType: "ROUTE_STATION",
        aggregateId: stop.id,
        eventType: EVENT_TYPES.ROUTE_STATION_REMOVED,
        topic: KAFKA_TOPICS.ROUTE_STATION_REMOVED,
        payload: RouteEventMapper.toStationRemovedEvent(route.trainId, stop),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.ROUTE_STATION_REMOVED,
        },
      });
    });
  }

  /**
   * Soft deletes a Route by setting isActive to false.
   * Runs the active schedules check guard before deactivating.
   *
   * @param routeId The Route ID to soft-delete.
   * @throws {ApiError} If route not found, or referenced by schedules.
   */
  async deleteRoute(routeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const route = await this.routeRepository.getRouteById(routeId, true, tx);
      if (!route) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
      }

      // Check schedules guard
      await this.ensureRouteCanBeDeleted(routeId, tx);

      const updatedRoute = await this.routeRepository.updateRoute(
        routeId,
        { isActive: false },
        tx,
      );

      await this.outboxRepository.insert(tx, {
        aggregateType: "ROUTE",
        aggregateId: route.id,
        eventType: EVENT_TYPES.ROUTE_DELETED,
        topic: KAFKA_TOPICS.ROUTE_DELETED,
        payload: RouteEventMapper.toDeletedEvent(updatedRoute),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.ROUTE_DELETED,
        },
      });

      return updatedRoute;
    });
  }

  /**
   * Updates a Route's isActive status (activation or deactivation).
   * Runs the schedules check guard if deactivating.
   *
   * @param routeId The Route ID.
   * @param isActive The target status.
   * @throws {ApiError} If route not found, or referenced by schedules.
   * @returns A promise resolving to the updated route.
   */
  async updateRouteStatus(routeId: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const route = await this.routeRepository.getRouteById(routeId, true, tx);
      if (!route) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.ROUTE_NOT_FOUND);
      }

      if (isActive === false) {
        // Run check schedules guard
        await this.ensureRouteCanBeDeleted(routeId, tx);
      }

      const updatedRoute = await this.routeRepository.updateRoute(
        routeId,
        { isActive },
        tx,
      );

      await this.outboxRepository.insert(tx, {
        aggregateType: "ROUTE",
        aggregateId: route.id,
        eventType: EVENT_TYPES.ROUTE_UPDATED,
        topic: KAFKA_TOPICS.ROUTE_UPDATED,
        payload: RouteEventMapper.toUpdatedEvent(updatedRoute),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.ROUTE_UPDATED,
        },
      });

      return updatedRoute;
    });
  }
}
