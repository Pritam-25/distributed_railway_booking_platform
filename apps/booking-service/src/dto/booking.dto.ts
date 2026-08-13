import { PassengerGender } from "@generated/prisma/enums.js";
import { z } from "zod";

/**
 * Reusable UUID schema factory with a configurable error message.
 *
 * @param message - Error message used when the value is not a valid UUID.
 */
export const uuidSchema = (message = "Invalid UUID format") => z.uuid(message);

export const passengerSchema = z.object({
  fullName: z
    .string({ message: "Full name is required" })
    .trim()
    .min(1, "Full name is required")
    .max(100, "Full name must not exceed 100 characters"),
  age: z
    .number({ message: "Age is required and must be a number" })
    .int("Age must be an integer")
    .min(1, "Age must be at least 1")
    .max(120, "Age cannot exceed 120"),
  gender: z.enum(PassengerGender, {
    message: "Gender must be MALE, FEMALE, or OTHER",
  }),
  berthPreference: z
    .enum(
      ["LOWER", "MIDDLE", "UPPER", "SIDE_LOWER", "SIDE_UPPER", "NO_PREFERENCE"],
      { message: "Invalid berth preference value" },
    )
    .optional(),
});

export const createBookingSchema = z
  .object({
    idempotencyKey: uuidSchema("Idempotency key must be a valid UUID"),
    scheduleId: uuidSchema("Schedule ID must be a valid UUID"),
    fromStationId: uuidSchema("From station ID must be a valid UUID"),
    toStationId: uuidSchema("To station ID must be a valid UUID"),
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
  });

export type PassengerDto = z.infer<typeof passengerSchema>;
export type CreateBookingDto = z.infer<typeof createBookingSchema>;
