import {
  ScheduleCreatedEventV1,
  ScheduleStatusChangedEventV1,
  type ScheduleCreatedEventV1Type,
  type ScheduleStatusChangedEventV1Type,
} from "@irctc/contracts";
import { ScheduleStatus } from "@generated/prisma/enums.js";

interface PrismaScheduleSnapshot {
  id: string;
  trainId: string;
  departureDate: Date;
  status: ScheduleStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  train: {
    trainNumber: string;
    trainName: string;
    category: string;
    route?: {
      id: string;
      routeStation: {
        stationId: string;
        station: {
          code: string;
          name: string;
        };
        stopNumber: number;
        arrivalMinutes: number | null;
        departureMinutes: number | null;
        distanceFromStart: number;
      }[];
    } | null;
    coaches: {
      id: string;
      coachNumber: string;
      coachType: string;
      totalSeats: number;
      seats: {
        id: string;
        seatNumber: number;
        seatType: string;
      }[];
    }[];
    operatingDays: {
      dayOfWeek: number;
    }[];
  };
}

/**
 * Mapper utility to translate internal Prisma schedule records and snapshot layouts
 * into standardized Kafka outbox event payloads.
 */
export class ScheduleEventMapper {
  /**
   * Maps a schedule record with its nested train snapshot layout to a ScheduleCreatedEventV1 payload.
   *
   * @param schedule The schedule record with train details loaded.
   * @returns The V1 ScheduleCreatedEvent mapping.
   */
  static toCreatedEvent(
    schedule: PrismaScheduleSnapshot,
  ): ScheduleCreatedEventV1Type {
    const route = schedule.train.route;
    if (!route?.id) {
      throw new Error(
        `Cannot map ScheduleCreatedEventV1 without routeId. scheduleId=${schedule.id}`,
      );
    }
    const stops = route
      ? route.routeStation.map((stop) => ({
          stationId: stop.stationId,
          stationCode: stop.station.code,
          stationName: stop.station.name,
          stopNumber: stop.stopNumber,
          arrivalMinutes: stop.arrivalMinutes,
          departureMinutes: stop.departureMinutes,
          distanceFromStart: stop.distanceFromStart,
        }))
      : [];

    const coaches = schedule.train.coaches.map((coach) => ({
      coachId: coach.id,
      coachNumber: coach.coachNumber,
      coachType: coach.coachType,
      totalSeats: coach.totalSeats,
      seats: coach.seats.map((seat) => ({
        seatId: seat.id,
        seatNumber: seat.seatNumber,
        seatType: seat.seatType,
      })),
    }));

    return ScheduleCreatedEventV1.parse({
      eventId: crypto.randomUUID(),
      scheduleId: schedule.id,
      trainId: schedule.trainId,
      trainNumber: schedule.train.trainNumber,
      trainName: schedule.train.trainName,
      routeId: route.id,
      trainCategory: schedule.train
        .category as ScheduleCreatedEventV1Type["trainCategory"],
      departureDate: schedule.departureDate,
      status: schedule.status,
      version: schedule.version,
      operatingDays: schedule.train.operatingDays.map((od) => od.dayOfWeek),
      stops,
      coaches,
      createdAt: schedule.createdAt,
    });
  }

  /**
   * Maps a schedule record to a ScheduleStatusChangedEventV1 payload.
   *
   * @param schedule The updated schedule record.
   * @returns The V1 ScheduleStatusChangedEvent mapping.
   */
  static toStatusChangedEvent(
    schedule: PrismaScheduleSnapshot,
  ): ScheduleStatusChangedEventV1Type {
    const routeId = schedule.train.route?.id;
    if (!routeId) {
      throw new Error(
        `Cannot map ScheduleStatusChangedEventV1 without routeId. scheduleId=${schedule.id}`,
      );
    }
    return ScheduleStatusChangedEventV1.parse({
      eventId: crypto.randomUUID(),
      scheduleId: schedule.id,
      trainId: schedule.trainId,
      routeId,
      departureDate: schedule.departureDate,
      status: schedule.status,
      version: schedule.version,
      updatedAt: schedule.updatedAt,
    });
  }
}
