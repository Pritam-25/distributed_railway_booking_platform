import { z } from "zod";

/**
 * Zod validation schema and DTO for creating a new station record.
 */
export const createStationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Station name must be at least 2 characters long"),
  code: z
    .string()
    .trim()
    .min(2, "Station code must be at least 2 characters long")
    .toUpperCase(),
  zone: z
    .string()
    .trim()
    .min(2, "zone name must be at least 2 characters long")
    .optional(),
  state: z
    .string()
    .trim()
    .min(2, "State name must be at least 2 characters long")
    .optional(),
  isActive: z.boolean().default(true),
});

export type CreateStationRequestDto = z.infer<typeof createStationSchema>;

/**
 * Zod validation schema and DTO for updating an existing station record.
 */
export const updateStationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Station name must be at least 2 characters long")
    .optional(),
  code: z
    .string()
    .trim()
    .min(2, "Station code must be at least 2 characters long")
    .toUpperCase()
    .optional(),
  zone: z
    .string()
    .trim()
    .min(2, "zone name must be at least 2 characters long")
    .optional(),
  state: z
    .string()
    .trim()
    .min(2, "State name must be at least 2 characters long")
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateStationRequestDto = z.infer<typeof updateStationSchema>;

/**
 * Zod validation schema and DTO for listing stations with optional filters and pagination.
 */
export const listStationsQuerySchema = z.object({
  code: z.string().optional(),
  zone: z.string().optional(),
  state: z.string().optional(),
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

export type ListStationsQueryDto = z.infer<typeof listStationsQuerySchema>;

/**
 * Zod validation schema and DTO for station ID parameter.
 */
export const stationIdParamSchema = z.object({
  stationId: z.uuid("Invalid station ID format. Must be a valid UUID."),
});

export type StationIdParamDto = z.infer<typeof stationIdParamSchema>;

/**
 * Filter criteria for listing stations.
 */
export interface StationFilters {
  code?: string | undefined;
  zone?: string | undefined;
  state?: string | undefined;
  isActive?: boolean | undefined;
}
