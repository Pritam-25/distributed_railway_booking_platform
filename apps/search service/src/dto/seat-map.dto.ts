import "@irctc/openapi";
import { z } from "zod";

/**
 * Reusable UUID schema factory with a configurable error message.
 *
 * @param message - Error message used when the value is not a valid UUID.
 */
export const uuidSchema = (message = "Invalid UUID format") =>
  z.uuid(message).openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
  });

const SEAT_MAP_STATUS = [
  "OK",
  "SCHEDULE_NOT_FOUND",
  "SCHEDULE_INACTIVE",
] as const;

// ── Path params: scheduleId ────────────────────────────────────────────────

export const seatMapParamsSchema = z
  .object({
    scheduleId: uuidSchema("Invalid scheduleId format. Must be a valid UUID."),
  })
  .openapi("SeatMapPathParams");

export type SeatMapParamsDto = z.infer<typeof seatMapParamsSchema>;

// ── Query: from/to station ids or codes ─────────────────────────────────────

export const stationIdentifierSchema = (
  message = "Invalid station identifier",
) =>
  z.string({ message }).min(1, message).openapi({
    example: "NDLS",
    description: "Station UUID or Station Code (e.g. NDLS, HWH)",
  });

export const seatMapQuerySchema = z
  .object({
    fromStation: stationIdentifierSchema("fromStation is required."),
    toStation: stationIdentifierSchema("toStation is required."),
  })
  .refine(
    (data) =>
      data.fromStation.trim().toUpperCase() !==
      data.toStation.trim().toUpperCase(),
    {
      message: "fromStation and toStation must be different.",
      path: ["toStation"],
    },
  )
  .openapi("SeatMapQueryParams");

export type SeatMapQueryDto = z.infer<typeof seatMapQuerySchema>;

// ── Response sub-shapes ────────────────────────────────────────────────────

export const seatMapSeatSchema = z
  .object({
    seatId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440020" }),
    seatNumber: z.number().int().openapi({ example: 12 }),
    seatType: z.string().openapi({ example: "LOWER" }),
    berthType: z.string().openapi({ example: "SEATER" }),
    price: z.string().openapi({ example: "2.5000" }),
    isBooked: z.boolean().openapi({ example: false }),
    quota: z.string().openapi({ example: "GENERAL" }),
    status: z.string().default("AVAILABLE").openapi({
      example: "AVAILABLE",
      description: "AVAILABLE | HELD | BOOKED",
    }),
  })
  .openapi("SeatMapSeat");

export type SeatMapSeatDto = z.infer<typeof seatMapSeatSchema>;

export const seatMapCoachSchema = z
  .object({
    coachId: uuidSchema("Invalid coachId format. Must be a valid UUID."),
    coachNumber: z.string().openapi({ example: "A1" }),
    coachType: z.string().openapi({ example: "AC_2A" }),
    totalSeats: z.number().int().openapi({ example: 48 }),
    seats: z.array(seatMapSeatSchema),
  })
  .openapi("SeatMapCoach");

export type SeatMapCoachDto = z.infer<typeof seatMapCoachSchema>;

export const seatMapResponseSchema = z
  .object({
    status: z.enum(SEAT_MAP_STATUS).openapi({
      example: "OK",
      description: "OK | SCHEDULE_NOT_FOUND | SCHEDULE_INACTIVE",
    }),
    coaches: z.array(seatMapCoachSchema),
  })
  .openapi("SeatMapResponse");

export type SeatMapResponseDto = z.infer<typeof seatMapResponseSchema>;
