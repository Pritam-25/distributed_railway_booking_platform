import { z } from "zod"

export const passengerFormSchema = z.object({
  seatId: z.uuid("Seat ID must be a valid UUID"),
  seatNumber: z.number(),
  fullName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
  age: z
    .number()
    .int("Age must be an integer")
    .min(1, "Age must be at least 1")
    .max(120, "Age cannot exceed 120"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  berthPreference: z
    .enum([
      "LOWER",
      "MIDDLE",
      "UPPER",
      "SIDE_LOWER",
      "SIDE_UPPER",
      "NO_PREFERENCE",
    ])
    .optional(),
})

export const createBookingSchema = z
  .object({
    scheduleId: z.uuid("Schedule ID must be a valid UUID"),
    fromStationId: z.uuid("From station ID must be a valid UUID"),
    toStationId: z.uuid("To station ID must be a valid UUID"),
    fromSequence: z.number().int().min(1).optional(),
    toSequence: z.number().int().min(2).optional(),
    seatIds: z
      .array(z.uuid("Invalid seat ID format"))
      .min(1, "Please select at least 1 seat to book.")
      .max(6, "Maximum 6 seats permitted per booking."),
    passengers: z
      .array(passengerFormSchema)
      .min(1, "Please select at least 1 seat to book.")
      .max(6, "Maximum 6 seats permitted per booking."),
  })
  .refine((data) => data.fromStationId !== data.toStationId, {
    message: "Origin and destination stations must be different",
    path: ["toStationId"],
  })
  .refine((data) => data.seatIds.length === data.passengers.length, {
    message: "Number of selected seats must equal number of passenger details",
    path: ["passengers"],
  })
  .refine((data) => new Set(data.seatIds).size === data.seatIds.length, {
    message: "Selected seats must be unique",
    path: ["seatIds"],
  })

export type PassengerFormValues = z.infer<typeof passengerFormSchema>
export type CreateBookingFormValues = z.infer<typeof createBookingSchema>
