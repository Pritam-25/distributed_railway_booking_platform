import "@irctc/openapi";
import { z } from "zod";

/**
 * Train category enum mirrored from the admin-side Zod event schema.
 * Kept inline (rather than imported from `@irctc/contracts`) so this file
 * remains the single source of truth for query validation.
 */
const TRAIN_CATEGORY = [
  "RAJDHANI",
  "SHATABDI",
  "VANDE_BHARAT",
  "DURONTO",
  "SUPERFAST",
  "PASSENGER",
  "EXPRESS",
  "DEMU",
  "MEMU",
] as const;

/**
 * Schedule lifecycle status mirrored from the admin-side Zod event schema.
 */
const SCHEDULE_STATUS = ["DRAFT", "ACTIVE", "CANCELLED"] as const;

/**
 * Query schema for `GET /api/v1/search/trains`.
 *
 * `fromStation` and `toStation` accept either an uppercase station code
 * (e.g. `NDLS`) or a UUID. The service resolves them against the
 * existing `stations` Elasticsearch index before issuing the schedule
 * query.
 *
 * Only `fromStation`, `toStation`, and `date` are required.
 * `category`, `limit`, and `offset` are all optional — `limit` defaults to
 * 10 and `offset` defaults to 0.
 */
export const trainSearchQuerySchema = z
  .object({
    fromStation: z
      .string()
      .trim()
      .min(2, "fromStation must be at least 2 characters long.")
      .max(64, "fromStation must be 64 characters or fewer.")
      .openapi({ example: "Howrah Jn" }),

    toStation: z
      .string()
      .trim()
      .min(2, "toStation must be at least 2 characters long.")
      .max(64, "toStation must be 64 characters or fewer.")
      .openapi({ example: "New Delhi" }),

    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format.")
      .openapi({ example: "2026-08-03" }),

    category: z
      .enum(TRAIN_CATEGORY)
      .optional()
      .openapi({ example: "RAJDHANI" }),

    limit: z.coerce
      .number()
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(50, "Limit cannot exceed 50.")
      .default(10)
      .openapi({ example: 10 }),

    offset: z.coerce
      .number()
      .int("Offset must be an integer.")
      .min(0, "Offset cannot be negative.")
      .default(0)
      .openapi({ example: 0 }),
  })
  .openapi("TrainSearchQueryParams");

export type TrainSearchQueryDto = z.infer<typeof trainSearchQuerySchema>;

// ────────────────────────────────────────────────────────────────────────────
// Internal storage shape — Elasticsearch documents persisted by
// `ScheduleProjectionService` and read by `TrainSearchRepository`. These
// schemas exist purely to give the type system a single source of truth and
// to keep the openapi generator reachable; they are not exposed in any
// public response.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Single stop inside a schedule document.
 */
export const trainScheduleStopDocumentSchema = z
  .object({
    stationId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    stationCode: z.string().openapi({ example: "HWH" }),
    stationName: z.string().openapi({ example: "Howrah Jn" }),
    sequenceNumber: z.number().int().openapi({ example: 1 }),
    arrivalMinutes: z.number().int().nullable().openapi({ example: null }),
    departureMinutes: z.number().int().nullable().openapi({ example: 985 }),
    distanceFromStart: z.number().int().openapi({ example: 1447 }),
  })
  .openapi("TrainScheduleStopDocument");

export type TrainScheduleStopDocument = z.infer<
  typeof trainScheduleStopDocumentSchema
>;

/**
 * Coach snapshot stored on the projection. Drives fare-range computation
 * at projection time.
 */
export const coachDocumentSchema = z
  .object({
    coachId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440001" }),
    coachNumber: z.string().openapi({ example: "A1" }),
    coachType: z.string().openapi({ example: "AC_2A" }),
    totalSeats: z.number().int().openapi({ example: 48 }),
    pricePerKm: z.number().openapi({ example: 2.5 }),
  })
  .openapi("CoachDocument");

export type CoachDocument = z.infer<typeof coachDocumentSchema>;

/**
 * Aggregated seat capacity and per-coach-type breakdown derived from the
 * admin `ScheduleCreatedEventV1` snapshot. Note: this is **capacity**, not
 * live availability — booking-service fetches the live seat-grid from
 * inventory-service for the seat-picker view.
 */
export const availableSeatsSchema = z
  .object({
    total: z.number().int().openapi({ example: 432 }),
    byCoachType: z
      .record(z.string(), z.number().int())
      .openapi({ example: { AC_2A: 48, AC_3A: 96, SL: 288 } }),
  })
  .openapi("AvailableSeats");

export type AvailableSeatsDto = z.infer<typeof availableSeatsSchema>;

/**
 * Fare range across seat types for the schedule.
 *
 * Computed at projection time as `pricePerKm × totalDistance` per seat,
 * then min/max folded. Currency is fixed to INR for the MVP.
 */
export const fareRangeSchema = z
  .object({
    min: z.number().openapi({ example: 850 }),
    max: z.number().openapi({ example: 4250 }),
    currency: z.literal("INR").openapi({ example: "INR" }),
  })
  .openapi("FareRange");

export type FareRangeDto = z.infer<typeof fareRangeSchema>;

/**
 * Full shape of a single schedule document persisted in the
 * `train_schedules` Elasticsearch index by {@link ScheduleProjectionService}.
 *
 * `_id` is implicit — equal to `scheduleId`.
 */
export const trainScheduleDocumentSchema = z
  .object({
    scheduleId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440010" }),
    trainId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440011" }),
    trainNumber: z.string().openapi({ example: "12301" }),
    trainName: z.string().openapi({ example: "Rajdhani Express" }),
    trainCategory: z.string().openapi({ example: "RAJDHANI" }),
    routeId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440012" }),
    departureDate: z.string().openapi({ example: "2026-09-15" }),
    status: z.enum(SCHEDULE_STATUS).openapi({ example: "ACTIVE" }),
    version: z.number().int().openapi({ example: 1 }),
    operatingDays: z
      .array(z.number().int().min(0).max(6))
      .openapi({ example: [0, 1, 2, 3, 4, 5, 6] }),
    fromStationId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440013" }),
    toStationId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440014" }),
    totalDistance: z.number().int().openapi({ example: 1447 }),
    routesServed: z.array(z.string()).openapi({
      example: [
        "550e8400-e29b-41d4-a716-446655440013:550e8400-e29b-41d4-a716-446655440014",
      ],
    }),
    stops: z.array(trainScheduleStopDocumentSchema),
    coaches: z.array(coachDocumentSchema),
    fareRange: fareRangeSchema,
    capacity: availableSeatsSchema,
    createdAt: z.string().openapi({ example: "2026-08-01T00:00:00.000Z" }),
    updatedAt: z.string().openapi({ example: "2026-08-01T00:00:00.000Z" }),
  })
  .openapi("TrainScheduleDocument");

export type TrainScheduleDocument = z.infer<typeof trainScheduleDocumentSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Public response shapes — wired into the OpenAPI spec via
// `src/openapi/registry.ts` so orval emits typed React Query models.
// ────────────────────────────────────────────────────────────────────────────

/**
 * ## TrainSearchResult
 *
 * One row in the `data.trains` array returned by `GET /api/v1/search/trains`.
 */
export const trainSearchResultSchema = z
  .object({
    scheduleId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440010" }),
    trainId: z
      .string()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440011" }),
    trainNumber: z.string().openapi({ example: "12301" }),
    trainName: z.string().openapi({ example: "Rajdhani Express" }),
    category: z.string().openapi({ example: "RAJDHANI" }),
    from: z.object({
      stationId: z
        .string()
        .openapi({ example: "550e8400-e29b-41d4-a716-446655440013" }),
      code: z.string().openapi({ example: "NDLS" }),
      name: z.string().openapi({ example: "New Delhi" }),
      departureTime: z
        .string()
        .nullable()
        .openapi({ example: "2026-09-15T16:25:00.000Z" }),
      platform: z.string().nullable().openapi({ example: "9" }),
    }),
    to: z.object({
      stationId: z
        .string()
        .openapi({ example: "550e8400-e29b-41d4-a716-446655440014" }),
      code: z.string().openapi({ example: "HWH" }),
      name: z.string().openapi({ example: "Howrah" }),
      arrivalTime: z
        .string()
        .nullable()
        .openapi({ example: "2026-09-16T09:55:00.000Z" }),
      platform: z.string().nullable().openapi({ example: "9" }),
    }),
    durationMinutes: z.number().int().nullable().openapi({ example: 1050 }),
    distanceKm: z.number().int().openapi({ example: 1447 }),
    fareRange: fareRangeSchema,
    availableSeats: availableSeatsSchema,
    status: z.enum(SCHEDULE_STATUS).openapi({ example: "ACTIVE" }),
    operatingDays: z.array(z.string()).openapi({
      example: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
    }),
  })
  .openapi("TrainSearchResult");

export type TrainSearchResultDto = z.infer<typeof trainSearchResultSchema>;

/**
 * ## TrainSearchResponse
 *
 * Top-level `data` shape inside the success envelope for
 * `GET /api/v1/search/trains`.
 */
export const trainSearchResponseSchema = z
  .object({
    fromStation: z.object({
      stationId: z
        .string()
        .openapi({ example: "550e8400-e29b-41d4-a716-446655440013" }),
      code: z.string().openapi({ example: "NDLS" }),
      name: z.string().openapi({ example: "New Delhi" }),
    }),
    toStation: z.object({
      stationId: z
        .string()
        .openapi({ example: "550e8400-e29b-41d4-a716-446655440014" }),
      code: z.string().openapi({ example: "HWH" }),
      name: z.string().openapi({ example: "Howrah" }),
    }),
    date: z.string().openapi({ example: "2026-09-15" }),
    count: z.number().int().openapi({ example: 4 }),
    trains: z.array(trainSearchResultSchema),
  })
  .openapi("TrainSearchResponse");

export type TrainSearchResponseDto = z.infer<typeof trainSearchResponseSchema>;

/**
 * Mapping helpers used by the projection service and the search service
 * to translate between the storage shape and the API shape.
 */
export const dayOfWeekLabel: Record<number, string> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};
