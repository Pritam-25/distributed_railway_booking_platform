import { z } from "zod";

export const createRouteSchema = z.object({
  trainId: z.string().uuid("Invalid train ID format. Must be a valid UUID."),
});

export type CreateRouteRequestDto = z.infer<typeof createRouteSchema>;

export const addStationToRouteSchema = z.object({
  stationId: z
    .string()
    .uuid("Invalid station ID format. Must be a valid UUID."),
  stopNumber: z
    .number()
    .int()
    .positive("Stop number must be a positive integer."),
  arrivalMinutes: z
    .number()
    .int()
    .nonnegative("Arrival minutes must be non-negative.")
    .nullable()
    .optional(),
  departureMinutes: z
    .number()
    .int()
    .nonnegative("Departure minutes must be non-negative.")
    .nullable()
    .optional(),
  distanceFromStart: z
    .number()
    .int()
    .nonnegative("Distance from start must be non-negative."),
  platformNumber: z.string().trim().nullable().optional(),
});

export type AddStationToRouteRequestDto = z.infer<
  typeof addStationToRouteSchema
>;

export const updateRouteStationSchema = z.object({
  arrivalMinutes: z
    .number()
    .int()
    .nonnegative("Arrival minutes must be non-negative.")
    .nullable()
    .optional(),
  departureMinutes: z
    .number()
    .int()
    .nonnegative("Departure minutes must be non-negative.")
    .nullable()
    .optional(),
  distanceFromStart: z
    .number()
    .int()
    .nonnegative("Distance from start must be non-negative.")
    .optional(),
  platformNumber: z.string().trim().nullable().optional(),
});

export type UpdateRouteStationRequestDto = z.infer<
  typeof updateRouteStationSchema
>;

export const updateRouteStatusSchema = z.object({
  isActive: z.boolean({ message: "isActive status must be a boolean value." }),
});

export type UpdateRouteStatusRequestDto = z.infer<
  typeof updateRouteStatusSchema
>;

export const listRoutesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export type ListRoutesQueryDto = z.infer<typeof listRoutesQuerySchema>;

export const routeIdParamSchema = z.object({
  routeId: z.string().uuid("Invalid route ID format. Must be a valid UUID."),
});

export type RouteIdParamDto = z.infer<typeof routeIdParamSchema>;

export const routeStationIdParamSchema = z.object({
  routeStationId: z
    .string()
    .uuid("Invalid route station ID format. Must be a valid UUID."),
});

export type RouteStationIdParamDto = z.infer<typeof routeStationIdParamSchema>;
