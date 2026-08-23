import { z } from "zod";

/**
 * Zod validation schema for gRPC `GetSeatDetailsRequest` payload.
 */
export const getSeatDetailsRequestSchema = z.object({
  scheduleId: z.uuid("scheduleId must be a valid UUID"),
  seatId: z.uuid("seatId must be a valid UUID"),
});

/**
 * Zod validation schema for gRPC `GetSeatsDetailsBatchRequest` payload.
 */
export const getSeatsDetailsBatchRequestSchema = z.object({
  scheduleId: z.uuid("scheduleId must be a valid UUID"),
  seatIds: z
    .array(z.uuid("Each seatId must be a valid UUID"))
    .min(1, "seatIds array cannot be empty"),
});

/**
 * Zod validation schema for gRPC `GetSeatMapRequest` payload.
 */
export const getSeatMapRequestSchema = z
  .object({
    scheduleId: z.uuid("scheduleId must be a valid UUID"),
    fromStationId: z.string().min(1, "fromStationId is required"),
    toStationId: z.string().min(1, "toStationId is required"),
  })
  .refine((data) => data.fromStationId !== data.toStationId, {
    message: "fromStationId and toStationId must be different stations",
    path: ["toStationId"],
  });

/**
 * Zod validation schema for gRPC `ValidateBookingRequest` payload.
 */
export const validateBookingRequestSchema = z
  .object({
    scheduleId: z.uuid("scheduleId must be a valid UUID"),
    fromStationId: z.string().min(1, "fromStationId is required"),
    toStationId: z.string().min(1, "toStationId is required"),
    clientRequestedAt: z.date().optional(),
  })
  .refine((data) => data.fromStationId !== data.toStationId, {
    message: "fromStationId and toStationId must be different stations",
    path: ["toStationId"],
  });

export type GetSeatDetailsRequestDto = z.infer<
  typeof getSeatDetailsRequestSchema
>;
export type GetSeatsDetailsBatchRequestDto = z.infer<
  typeof getSeatsDetailsBatchRequestSchema
>;
export type GetSeatMapRequestDto = z.infer<typeof getSeatMapRequestSchema>;
export type ValidateBookingRequestDto = z.infer<
  typeof validateBookingRequestSchema
>;
