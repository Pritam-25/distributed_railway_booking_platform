import "@irctc/openapi";
import { z } from "zod";

/**
 * Query schema for `GET /api/v1/search/stations/suggest`.
 *
 * `q` is the user-entered autocomplete term; `limit` caps the number of
 * returned suggestions. `limit` defaults to 10 when omitted.
 */
export const stationSuggestQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(2, "Query must be at least 2 characters long.")
      .max(64, "Query must be 64 characters or fewer.")
      .openapi({ example: "HWR" }),

    limit: z.coerce
      .number()
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(20, "Limit cannot exceed 20.")
      .default(10)
      .openapi({ example: 10 }),
  })
  .openapi("StationSuggestQueryParams");

export type StationSuggestQueryDto = z.infer<typeof stationSuggestQuerySchema>;

// ======================== For OpenAPI Generation ======================== //

/**
 * ## StationSuggestion
 *
 * A single station suggestion row returned by the suggest endpoint.
 *
 * The shape mirrors the Elasticsearch projection written by the station
 * consumer — controllers must not transform or augment it.
 */
export const stationSuggestionSchema = z
  .object({
    stationId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    code: z.string().openapi({ example: "NDLS" }),
    name: z.string().openapi({ example: "New Delhi" }),
    zone: z.string().nullable().openapi({ example: "Northern Railway" }),
    state: z.string().nullable().openapi({ example: "Delhi" }),
    isActive: z.boolean().openapi({ example: true }),
  })
  .openapi("StationSuggestion");

export type StationSuggestionDto = z.infer<typeof stationSuggestionSchema>;

/**
 * Single-station suggestion row consumed by services and the repository.
 *
 * Mirrors `stationSuggestionSchema`. The DTO suffix is reserved for the
 * envelope-level type below.
 */
export type StationSuggestion = z.infer<typeof stationSuggestionSchema>;

/**
 * ## StationSuggestResponse
 *
 * Top-level `data` shape inside the success envelope for
 * `GET /api/v1/search/stations/suggest`.
 *
 * `count` is the number of suggestions returned (≤ `limit`).
 */
export const stationSuggestResponseSchema = z
  .object({
    count: z.number().int().openapi({ example: 3 }),
    stations: z.array(stationSuggestionSchema),
  })
  .openapi("StationSuggestResponse");

export type StationSuggestResponseDto = z.infer<
  typeof stationSuggestResponseSchema
>;
