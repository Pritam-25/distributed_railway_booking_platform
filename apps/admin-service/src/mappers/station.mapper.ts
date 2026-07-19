import type { Station } from "@generated/prisma/client.js";
import {
  StationCreatedEventV1,
  type StationCreatedEventV1Type,
} from "@irctc/contracts";
import {
  StationUpdatedEventV1,
  type StationUpdatedEventV1Type,
} from "@irctc/contracts";
import {
  StationDeactivatedEventV1,
  type StationDeactivatedEventV1Type,
} from "@irctc/contracts";

/**
 * Maps Station database entities to versioned event payloads.
 * Validates against @irctc/contracts schemas before returning.
 */
export class StationEventMapper {
  /**
   * Maps a database station entity to a stationCreatedEventV1 payload.
   *
   * @param station The station entity to map.
   * @returns The validated stationCreatedEventV1 event payload.
   */
  static toCreatedEvent(station: Station): StationCreatedEventV1Type {
    return StationCreatedEventV1.parse({
      eventId: crypto.randomUUID(),
      stationId: station.id,
      stationCode: station.code,
      stationName: station.name,
      zone: station.zone ?? "",
      state: station.state ?? "",
      isActive: station.isActive,
      createdAt: station.createdAt,
    });
  }

  /**
   * Maps a database station entity to a stationUpdatedEventV1 payload.
   *
   * @param station The station entity to map.
   * @returns The validated stationUpdatedEventV1 event payload.
   */
  static toUpdatedEvent(station: Station): StationUpdatedEventV1Type {
    return StationUpdatedEventV1.parse({
      eventId: crypto.randomUUID(),
      stationId: station.id,
      stationCode: station.code,
      stationName: station.name,
      zone: station.zone ?? "",
      state: station.state ?? "",
      isActive: station.isActive,
      updatedAt: station.updatedAt,
    });
  }

  /**
   * Maps a database station entity to a stationDeactivatedEventV1 payload.
   *
   * @param station The station entity to map.
   * @returns The validated stationDeactivatedEventV1 event payload.
   */
  static toDeactivatedEvent(station: Station): StationDeactivatedEventV1Type {
    return StationDeactivatedEventV1.parse({
      eventId: crypto.randomUUID(),
      stationId: station.id,
      stationCode: station.code,
      state: station.state ?? "",
      deactivatedAt: station.updatedAt,
    });
  }
}
