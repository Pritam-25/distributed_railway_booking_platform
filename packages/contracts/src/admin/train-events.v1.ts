import { z } from "zod";

export enum TrainCategory {
  RAJDHANI = "RAJDHANI",
  SHATABDI = "SHATABDI",
  VANDE_BHARAT = "VANDE_BHARAT",
  DURONTO = "DURONTO",
  SUPERFAST = "SUPERFAST",
  PASSENGER = "PASSENGER",
  EXPRESS = "EXPRESS",
  DEMU = "DEMU",
  MEMU = "MEMU",
}

/**
 * Schema for train created event.
 */
export const TrainCreatedEventV1 = z.object({
  eventId: z.uuid(),
  trainId: z.uuid(),
  trainNumber: z.string(),
  trainName: z.string(),
  category: z.enum(TrainCategory),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
});

/**
 * Schema for train updated event.
 */
export const TrainUpdatedEventV1 = z.object({
  eventId: z.uuid(),
  trainId: z.uuid(),
  trainNumber: z.string(),
  trainName: z.string(),
  category: z.enum(TrainCategory),
  isActive: z.boolean(),
  updatedAt: z.coerce.date(),
});

/**
 * Schema for train deactivated event.
 */
export const TrainDeactivatedEventV1 = z.object({
  eventId: z.uuid(),
  trainId: z.uuid(),
  trainNumber: z.string(),
  deactivatedAt: z.coerce.date(),
});

export type TrainCreatedEventV1Type = z.infer<typeof TrainCreatedEventV1>;

export type TrainUpdatedEventV1Type = z.infer<typeof TrainUpdatedEventV1>;

export type TrainDeactivatedEventV1Type = z.infer<
  typeof TrainDeactivatedEventV1
>;
