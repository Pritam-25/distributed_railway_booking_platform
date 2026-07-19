import { z } from "zod";

/**
 * Schema for route created event
 */
export const RouteCreatedEventV1 = z.object({
  eventId: z.uuid(),
  routeId: z.uuid(),
  trainId: z.uuid(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
});

/**
 * Schema for route updated event
 */
export const RouteUpdatedEventV1 = z.object({
  eventId: z.uuid(),
  routeId: z.uuid(),
  trainId: z.uuid(),
  isActive: z.boolean(),
  updatedAt: z.coerce.date(),
});

/**
 * Schema for route station added event
 */
export const RouteStationAddedEventV1 = z.object({
  eventId: z.uuid(),
  routeId: z.uuid(),
  trainId: z.uuid(),
  stationId: z.uuid(),
  stationCode: z.string(),
  stopNumber: z.number().int().positive(),
  arrivalMinutes: z.number().int().nonnegative().nullable().optional(),
  departureMinutes: z.number().int().nonnegative().nullable().optional(),
  distanceFromStart: z.number().int().nonnegative(),
  platformNumber: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

/**
 * Schema for route station updated event
 */
export const RouteStationUpdatedEventV1 = z.object({
  eventId: z.uuid(),
  routeId: z.uuid(),
  trainId: z.uuid(),
  routeStationId: z.uuid(),
  stationId: z.uuid(),
  stationCode: z.string(),
  stopNumber: z.number().int().positive(),
  arrivalMinutes: z.number().int().nonnegative().nullable().optional(),
  departureMinutes: z.number().int().nonnegative().nullable().optional(),
  distanceFromStart: z.number().int().nonnegative(),
  platformNumber: z.string().nullable().optional(),
  updatedAt: z.coerce.date(),
});

/**
 * Schema for route station removed event
 */
export const RouteStationRemovedEventV1 = z.object({
  eventId: z.uuid(),
  routeId: z.uuid(),
  trainId: z.uuid(),
  routeStationId: z.uuid(),
  stationId: z.uuid(),
  stationCode: z.string(),
  removedAt: z.coerce.date(),
});

/**
 * Schema for route deleted event
 */
export const RouteDeletedEventV1 = z.object({
  eventId: z.uuid(),
  routeId: z.uuid(),
  trainId: z.uuid(),
  deletedAt: z.coerce.date(),
});

export type RouteCreatedEventV1Type = z.infer<typeof RouteCreatedEventV1>;

export type RouteUpdatedEventV1Type = z.infer<typeof RouteUpdatedEventV1>;

export type RouteStationAddedEventV1Type = z.infer<
  typeof RouteStationAddedEventV1
>;

export type RouteStationUpdatedEventV1Type = z.infer<
  typeof RouteStationUpdatedEventV1
>;

export type RouteStationRemovedEventV1Type = z.infer<
  typeof RouteStationRemovedEventV1
>;

export type RouteDeletedEventV1Type = z.infer<typeof RouteDeletedEventV1>;
