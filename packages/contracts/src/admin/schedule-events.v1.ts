import { z } from "zod";

/**
 * Schema for schedule created event.
 */
export const ScheduleCreatedEventV1 = z.object({
  eventId: z.uuid(),
  scheduleId: z.uuid(),
  trainId: z.uuid(),
  trainNumber: z.string(),
  trainName: z.string(),
  routeId: z.uuid(),
  trainCategory: z.enum([
    "RAJDHANI",
    "SHATABDI",
    "VANDE_BHARAT",
    "DURONTO",
    "SUPERFAST",
    "PASSENGER",
    "EXPRESS",
    "DEMU",
    "MEMU",
  ]),
  departureDate: z.coerce.date(),
  status: z.enum(["DRAFT", "ACTIVE", "CANCELLED"]),
  version: z.number().int().nonnegative(),
  operatingDays: z.array(z.number().int().min(0).max(6)),

  // Route snapshot details ordered by stopNumber
  stops: z.array(
    z.object({
      stationId: z.uuid(),
      stationCode: z.string(),
      stationName: z.string(),
      stopNumber: z.number().int().positive(),
      arrivalMinutes: z.number().int().nonnegative().nullable(),
      departureMinutes: z.number().int().nonnegative().nullable(),
      distanceFromStart: z.number().int().nonnegative(),
    }),
  ),

  // Coach snapshot layouts for inventory initialization
  coaches: z.array(
    z.object({
      coachId: z.uuid(),
      coachNumber: z.string(),
      coachType: z.string(),
      totalSeats: z.number().int().positive(),
      seats: z.array(
        z.object({
          seatId: z.uuid(),
          seatNumber: z.number().int().positive(),
          seatType: z.string(),
        }),
      ),
    }),
  ),

  createdAt: z.coerce.date(),
});

/**
 * Schema for Schedule status changed event.
 */
export const ScheduleStatusChangedEventV1 = z.object({
  eventId: z.uuid(),
  scheduleId: z.uuid(),
  trainId: z.uuid(),
  routeId: z.uuid(),
  departureDate: z.coerce.date(),
  status: z.enum(["DRAFT", "ACTIVE", "CANCELLED"]),
  version: z.number().int().nonnegative(),
  updatedAt: z.coerce.date(),
});

export type ScheduleCreatedEventV1Type = z.infer<typeof ScheduleCreatedEventV1>;

export type ScheduleStatusChangedEventV1Type = z.infer<
  typeof ScheduleStatusChangedEventV1
>;
