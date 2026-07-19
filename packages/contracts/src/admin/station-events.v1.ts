import { z } from "zod";

/**
 * Schema for Created Station event.
 */
export const StationCreatedEventV1 = z.object({
  eventId: z.uuid(),
  stationId: z.uuid(),
  stationCode: z.string(),
  stationName: z.string(),
  zone: z.string(),
  state: z.string(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
});

/**
 * Schema for Updated Station event.
 */
export const StationUpdatedEventV1 = z.object({
  eventId: z.uuid(),
  stationId: z.uuid(),
  stationCode: z.string(),
  stationName: z.string(),
  zone: z.string(),
  state: z.string().nullable(),
  isActive: z.boolean(),
  updatedAt: z.coerce.date(),
});

/**
 * Schema for Deactivated Station event.
 */
export const StationDeactivatedEventV1 = z.object({
  eventId: z.uuid(),
  stationId: z.uuid(),
  stationCode: z.string(),
  deactivatedAt: z.coerce.date(),
});

export type StationCreatedEventV1Type = z.infer<typeof StationCreatedEventV1>;

export type StationUpdatedEventV1Type = z.infer<typeof StationUpdatedEventV1>;

export type StationDeactivatedEventV1Type = z.infer<
  typeof StationDeactivatedEventV1
>;
