import { TrainCategory } from "@generated/prisma/enums.js";
import { z } from "zod";

/**
 * Zod validation schema and DTO for creating a new train record.
 */
export const createTrainSchema = z.object({
  trainNumber: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Train number must be exactly 5 digits"),
  trainName: z
    .string()
    .trim()
    .min(2, "Train name must be at least 2 characters long"),
  category: z.enum(TrainCategory).default(TrainCategory.PASSENGER),
  isActive: z.boolean().default(true),
});

export type CreateTrainRequestDto = z.infer<typeof createTrainSchema>;

/**
 * Zod validation schema and DTO for updating an existing train record.
 */
export const updateTrainSchema = z
  .object({
    trainNumber: z
      .string()
      .trim()
      .regex(/^\d{5}$/, "Train number must be exactly 5 digits")
      .optional(),
    trainName: z
      .string()
      .trim()
      .min(2, "Train name must be at least 2 characters long")
      .optional(),
    category: z.enum(TrainCategory).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (payload) => Object.values(payload).some((value) => value !== undefined),
    { message: "At least one field must be provided for update" },
  );

export type UpdateTrainRequestDto = z.infer<typeof updateTrainSchema>;

/**
 * Zod validation schema and DTO for listing trains with optional filters and pagination.
 */
export const listTrainsQuerySchema = z.object({
  trainNumber: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Train number must be exactly 5 digits")
    .optional(),
  category: z.enum(TrainCategory).optional(),
  isActive: z
    .preprocess((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      return undefined;
    }, z.boolean())
    .optional(),
  page: z
    .preprocess(
      (val) => (val ? Number.parseInt(val as string, 10) : 1),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val ? Number.parseInt(val as string, 10) : 10),
      z.number().int().min(1).max(100),
    )
    .default(10),
});

export type ListTrainsQueryDto = z.infer<typeof listTrainsQuerySchema>;

/**
 * Zod validation schema and DTO for train ID parameter.
 */
export const trainIdParamSchema = z.object({
  trainId: z.uuid("Invalid train ID format. Must be a valid UUID."),
});

export type TrainIdParamDto = z.infer<typeof trainIdParamSchema>;

/**
 * Filter criteria for listing trains.
 */
export interface TrainFilters {
  trainNumber?: string | undefined;
  category?: TrainCategory | undefined;
  isActive?: boolean | undefined;
}
