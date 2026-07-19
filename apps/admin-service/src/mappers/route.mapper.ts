import {
  RouteCreatedEventV1,
  RouteUpdatedEventV1,
  RouteStationAddedEventV1,
  RouteStationUpdatedEventV1,
  RouteStationRemovedEventV1,
  RouteDeletedEventV1,
  type RouteCreatedEventV1Type,
  type RouteUpdatedEventV1Type,
  type RouteStationAddedEventV1Type,
  type RouteStationUpdatedEventV1Type,
  type RouteStationRemovedEventV1Type,
  type RouteDeletedEventV1Type,
} from "@irctc/contracts";

interface PrismaRoute {
  id: string;
  trainId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaRouteStation {
  id: string;
  routeId: string;
  stationId: string;
  stopNumber: number;
  arrivalMinutes: number | null;
  departureMinutes: number | null;
  distanceFromStart: number;
  platformNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  station?: {
    code: string;
  };
}

/**
 * Mapper utility to translate internal Prisma route and route station records
 * into standardized Kafka outbox event payloads.
 */
export class RouteEventMapper {
  /**
   * Maps a route record to a RouteCreatedEventV1 payload.
   *
   * @param route The created Route record.
   * @returns The V1 RouteCreatedEvent mapping.
   */
  static toCreatedEvent(route: PrismaRoute): RouteCreatedEventV1Type {
    return RouteCreatedEventV1.parse({
      eventId: crypto.randomUUID(),
      routeId: route.id,
      trainId: route.trainId,
      isActive: route.isActive,
      createdAt: route.createdAt,
    });
  }

  /**
   * Maps a route record to a RouteUpdatedEventV1 payload.
   *
   * @param route The updated Route record.
   * @returns The V1 RouteUpdatedEvent mapping.
   */
  static toUpdatedEvent(route: PrismaRoute): RouteUpdatedEventV1Type {
    return RouteUpdatedEventV1.parse({
      eventId: crypto.randomUUID(),
      routeId: route.id,
      trainId: route.trainId,
      isActive: route.isActive,
      updatedAt: route.updatedAt,
    });
  }

  /**
   * Maps a RouteStation record to a RouteStationAddedEventV1 payload.
   *
   * @param trainId The associated train's unique ID.
   * @param stop The added route station stop record.
   * @returns The V1 RouteStationAddedEvent mapping.
   */
  static toStationAddedEvent(
    trainId: string,
    stop: PrismaRouteStation,
  ): RouteStationAddedEventV1Type {
    return RouteStationAddedEventV1.parse({
      eventId: crypto.randomUUID(),
      routeId: stop.routeId,
      trainId,
      stationId: stop.stationId,
      stationCode: stop.station?.code || "",
      stopNumber: stop.stopNumber,
      arrivalMinutes: stop.arrivalMinutes,
      departureMinutes: stop.departureMinutes,
      distanceFromStart: stop.distanceFromStart,
      platformNumber: stop.platformNumber,
      createdAt: stop.createdAt,
    });
  }

  /**
   * Maps a RouteStation record to a RouteStationUpdatedEventV1 payload.
   *
   * @param trainId The associated train's unique ID.
   * @param stop The updated route station stop record.
   * @returns The V1 RouteStationUpdatedEvent mapping.
   */
  static toStationUpdatedEvent(
    trainId: string,
    stop: PrismaRouteStation,
  ): RouteStationUpdatedEventV1Type {
    return RouteStationUpdatedEventV1.parse({
      eventId: crypto.randomUUID(),
      routeId: stop.routeId,
      trainId,
      routeStationId: stop.id,
      stationId: stop.stationId,
      stationCode: stop.station?.code || "",
      stopNumber: stop.stopNumber,
      arrivalMinutes: stop.arrivalMinutes,
      departureMinutes: stop.departureMinutes,
      distanceFromStart: stop.distanceFromStart,
      platformNumber: stop.platformNumber,
      updatedAt: stop.updatedAt,
    });
  }

  /**
   * Maps a RouteStation record to a RouteStationRemovedEventV1 payload.
   *
   * @param trainId The associated train's unique ID.
   * @param stop The deleted route station stop record.
   * @returns The V1 RouteStationRemovedEvent mapping.
   */
  static toStationRemovedEvent(
    trainId: string,
    stop: PrismaRouteStation,
  ): RouteStationRemovedEventV1Type {
    return RouteStationRemovedEventV1.parse({
      eventId: crypto.randomUUID(),
      routeId: stop.routeId,
      trainId,
      routeStationId: stop.id,
      stationId: stop.stationId,
      stationCode: stop.station?.code || "",
      removedAt: new Date(),
    });
  }

  /**
   * Maps a route record to a RouteDeletedEventV1 payload.
   *
   * @param route The soft-deleted Route record.
   * @returns The V1 RouteDeletedEvent mapping.
   */
  static toDeletedEvent(route: PrismaRoute): RouteDeletedEventV1Type {
    return RouteDeletedEventV1.parse({
      eventId: crypto.randomUUID(),
      routeId: route.id,
      trainId: route.trainId,
      deletedAt: new Date(),
    });
  }
}
