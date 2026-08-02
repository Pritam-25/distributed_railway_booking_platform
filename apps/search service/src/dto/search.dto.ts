import { z } from "zod";

export const stationSuggestQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Query must be at least 2 characters long.")
    .max(64, "Query must be 64 characters or fewer."),

  limit: z.coerce
    .number()
    .int("Limit must be an integer.")
    .min(1, "Limit must be at least 1.")
    .max(20, "Limit cannot exceed 20.")
    .default(10),
});

export type StationSuggestQueryDto = z.infer<typeof stationSuggestQuerySchema>;

/**
 * ## StationSuggestion
 *
 * A single station suggestion interface
 *
 * The shape mirrors the Elasticsearch projection written by the station
 * consumer — controllers must not transform or augment it.
 */
export interface StationSuggestion {
  stationId: string;
  code: string;
  name: string;
  zone: string | null;
  state: string | null;
  isActive: boolean;
}
