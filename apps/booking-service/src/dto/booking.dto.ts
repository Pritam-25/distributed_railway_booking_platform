import "@irctc/openapi";
import { PassengerGender, BookingStatus } from "@generated/prisma/client.js";
import { z } from "zod";

/**
 * Reusable UUID schema factory with a configurable error message.
 *
 * @param message - Error message used when the value is not a valid UUID.
 */
export const uuidSchema = (message = "Invalid UUID format") =>
  z.uuid(message).openapi({
    example: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  });

export const passengerSchema = z
  .object({
    fullName: z
      .string({ message: "Full name is required" })
      .trim()
      .min(1, "Full name is required")
      .max(100, "Full name must not exceed 100 characters")
      .openapi({ example: "Pritam Maity" }),
    age: z
      .number({ message: "Age is required and must be a number" })
      .int("Age must be an integer")
      .min(1, "Age must be at least 1")
      .max(120, "Age cannot exceed 120")
      .openapi({ example: 30 }),
    gender: z
      .enum(PassengerGender, {
        message: "Gender must be MALE, FEMALE, or OTHER",
      })
      .openapi({ example: PassengerGender.MALE }),
    berthPreference: z
      .enum(
        [
          "LOWER",
          "MIDDLE",
          "UPPER",
          "SIDE_LOWER",
          "SIDE_UPPER",
          "NO_PREFERENCE",
        ],
        { message: "Invalid berth preference value" },
      )
      .optional()
      .openapi({ example: "LOWER" }),
  })
  .openapi("Passenger");

export const createBookingSchema = z
  .object({
    idempotencyKey: uuidSchema("Idempotency key must be a valid UUID"),
    scheduleId: uuidSchema("Schedule ID must be a valid UUID"),
    fromStationId: uuidSchema("From station ID must be a valid UUID"),
    toStationId: uuidSchema("To station ID must be a valid UUID"),
    fromSequence: z.number().int().min(1).optional(),
    toSequence: z.number().int().min(2).optional(),
    legIndices: z.array(z.number().int().min(1)).optional(),
    seatIds: z
      .array(uuidSchema("Each seat ID must be a valid UUID"), {
        message: "seatIds must be an array",
      })
      .min(1, "At least 1 seat must be selected")
      .max(6, "Cannot select more than 6 seats"),
    passengers: z
      .array(passengerSchema, {
        message: "passengers must be an array",
      })
      .min(1, "At least 1 passenger details must be provided")
      .max(6, "Cannot have more than 6 passengers"),
  })
  .refine((data) => data.seatIds.length === data.passengers.length, {
    message: "Number of seatIds must equal number of passengers",
    path: ["passengers"],
  })
  .refine((data) => new Set(data.seatIds).size === data.seatIds.length, {
    message: "seatIds must contain unique values",
    path: ["seatIds"],
  })
  .refine((data) => data.fromStationId !== data.toStationId, {
    message: "fromStationId and toStationId must be different",
    path: ["toStationId"],
  })
  .openapi("CreateBookingRequest");

export type PassengerDto = z.infer<typeof passengerSchema>;
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const createBookingResponseSchema = z
  .object({
    id: uuidSchema("Booking ID must be a valid UUID"),
    pnr: z.string().openapi({
      example: "K3M7NP2R4X",
      description: "10-character alphanumeric PNR.",
    }),
    status: z.enum(BookingStatus).openapi({ example: BookingStatus.PENDING }),
  })
  .openapi("CreateBookingResponse");

export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>;

export const bookingIdParamSchema = z.object({
  bookingId: uuidSchema("Booking ID must be a valid UUID"),
});

export type BookingIdParamDto = z.infer<typeof bookingIdParamSchema>;
