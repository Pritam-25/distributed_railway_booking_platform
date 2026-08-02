import { z } from "zod";

/**
 * Query schema for `GET /api/v1/search/trains`.
 *
 * `fromStation` and `toStation` accept either an uppercase station code
 * (e.g. `NDLS`) or a UUID. The service resolves them against the
 * existing `stations` Elasticsearch index before issuing the schedule
 * query.
 */
export const trainSearchQuerySchema = z.object({
  fromStation: z
    .string()
    .trim()
    .min(2, "fromStation must be at least 2 characters long.")
    .max(64, "fromStation must be 64 characters or fewer."),

  toStation: z
    .string()
    .trim()
    .min(2, "toStation must be at least 2 characters long.")
    .max(64, "toStation must be 64 characters or fewer."),

  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format."),

  category: z
    .enum([
      "RAJDHANI",
      "SHATABDI",
      "VANDE_BHARAT",
      "DURONTO",
      "SUPERFAST",
      "PASSENGER",
      "EXPRESS",
      "DEMU",
      "MEMU",
    ])
    .optional(),

  limit: z.coerce
    .number()
    .int("Limit must be an integer.")
    .min(1, "Limit must be at least 1.")
    .max(50, "Limit cannot exceed 50.")
    .default(20),

  offset: z.coerce
    .number()
    .int("Offset must be an integer.")
    .min(0, "Offset cannot be negative.")
    .default(0),
});

export type TrainSearchQueryDto = z.infer<typeof trainSearchQuerySchema>;

/**
 * Shape of a single nested stop document stored under the `stops` field
 * in the `train_schedules` Elasticsearch index.
 */
export interface TrainScheduleStopDocument {
  stationId: string;
  stationCode: string;
  stationName: string;
  sequenceNumber: number;
  arrivalMinutes: number | null;
  departureMinutes: number | null;
  distanceFromStart: number;
}

/**
 * Aggregated seat capacity and per-coach-type breakdown derived from
 * the admin `ScheduleCreatedEventV1` snapshot. Note: this is
 * **capacity**, not live availability — booking-service fetches the
 * live seat-grid from inventory-service for the seat-picker view.
 */
export interface AvailableSeatsDto {
  total: number;
  byCoachType: Record<string, number>;
}

/**
 * Coach snapshot stored on the projection (used to drive fare-range
 * computation at projection time).
 */
export interface CoachDocument {
  coachId: string;
  coachNumber: string;
  coachType: string;
  totalSeats: number;
  pricePerKm: number;
}

/**
 * Fare range across seat types for the schedule.
 *
 * Computed at projection time as `pricePerKm × totalDistance` per seat,
 * then min/max folded. Currency is fixed to INR for the MVP.
 */
export interface FareRangeDto {
  min: number;
  max: number;
  currency: "INR";
}

/**
 * Full shape of a single schedule document persisted in the
 * `train_schedules` Elasticsearch index by {@link ScheduleProjectionService}.
 *
 * `_id` is implicit — equal to `scheduleId`.
 */
export interface TrainScheduleDocument {
  scheduleId: string;
  trainId: string;
  trainNumber: string;
  trainName: string;
  trainCategory: string;
  routeId: string;
  departureDate: string; // YYYY-MM-DD
  status: "DRAFT" | "ACTIVE" | "CANCELLED";
  version: number;
  operatingDays: number[]; // 0..6 (Sun..Sat)
  fromStationId: string;
  toStationId: string;
  totalDistance: number;
  routesServed: string[]; // ["<fromId>:<toId>", ...] flat precomputed pairs
  stops: TrainScheduleStopDocument[];
  coaches: CoachDocument[];
  fareRange: FareRangeDto;
  capacity: AvailableSeatsDto;
  createdAt: string;
  updatedAt: string;
}

/**
 * ## TrainSearchResultDto
 *
 * One row in the `data.trains` array returned by `GET /api/v1/search/trains`.
 */
export interface TrainSearchResultDto {
  scheduleId: string;
  trainId: string;
  trainNumber: string;
  trainName: string;
  category: string;
  from: {
    stationId: string;
    code: string;
    name: string;
    departureTime: string | null;
    platform: string | null;
  };
  to: {
    stationId: string;
    code: string;
    name: string;
    arrivalTime: string | null;
    platform: string | null;
  };
  durationMinutes: number | null;
  distanceKm: number;
  fareRange: FareRangeDto;
  availableSeats: AvailableSeatsDto;
  status: "DRAFT" | "ACTIVE" | "CANCELLED";
  operatingDays: string[];
}

/**
 * ## TrainSearchResponseDto
 *
 * Top-level `data` shape inside the success envelope.
 */
export interface TrainSearchResponseDto {
  fromStation: { stationId: string; code: string; name: string };
  toStation: { stationId: string; code: string; name: string };
  date: string;
  count: number;
  trains: TrainSearchResultDto[];
}

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
