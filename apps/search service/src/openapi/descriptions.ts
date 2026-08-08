import { buildEndpointDoc } from "@irctc/openapi";

/**
 * Human-readable descriptions for search-service OpenAPI operations.
 *
 * Consumed by `registry.ts` when registering each path — `summary` is the
 * short label that appears in API explorers; the longer `description`
 * covers edge cases, error semantics, and operational notes.
 */
export const searchServiceOpenApiDescriptions = {
  search: {
    suggestStations: buildEndpointDoc({
      summary: "Suggest stations for autocomplete",
      overview:
        "Returns a list of station suggestions matching a user-entered query. Backed by an Elasticsearch projection of `STATION_*` lifecycle events with a Redis read-through cache.",
      queryFields: [
        "`q` - The autocomplete search term. Minimum 2 characters; trimmed before lookup.",
        "`limit` - Maximum number of suggestions to return. Defaults to 10; max 20.",
      ],
      response:
        "Returns a `StationSuggestResponse` containing `count` and a `stations[]` array. Each station carries its canonical `stationId`, `code`, `name`, `zone`, `state`, and an `isActive` flag.",
      outcomes: [
        "200 OK - One or more stations matched (or zero, in which case `stations` is an empty array).",
        "400 Bad Request - The query failed schema validation (e.g. `q` shorter than 2 characters, or `limit` out of range).",
        "429 Too Many Requests - The caller exceeded the platform rate limit.",
        "500 Internal Server Error - Elasticsearch or Redis returned an unexpected error.",
      ],
      notes: [
        "The endpoint is public — no authentication is required.",
        "Results are served from Redis when warm; cache TTL is bounded by `SUGGEST_CACHE_TTL_SECONDS`.",
      ],
    }),
    searchTrains: buildEndpointDoc({
      summary: "Search trains by from/to station and date",
      overview:
        "Returns trains running between two stations on a given date, including timing, fare range, capacity, and operating-days metadata. Backed by an Elasticsearch projection of `SCHEDULE_CREATED` admin events with a Redis read-through cache.",
      queryFields: [
        "`fromStation` - Origin station code (e.g. `NDLS`) or UUID. Required.",
        "`toStation` - Destination station code (e.g. `HWH`) or UUID. Required.",
        "`date` - Travel date in `YYYY-MM-DD` format. Required.",
        "`category` - Optional filter by train category (e.g. `RAJDHANI`, `SHATABDI`).",
        "`limit` - Page size. Defaults to 10; max 50.",
        "`offset` - Pagination offset. Defaults to 0.",
      ],
      response:
        "Returns a `TrainSearchResponse` containing the resolved `fromStation`, `toStation`, the requested `date`, the total `count`, and a `trains[]` array. Each train carries timing, distance, fare range, capacity, and operating days.",
      outcomes: [
        "200 OK - The query ran; the `trains` array may be empty when no schedules match.",
        "400 Bad Request - The query failed schema validation (e.g. invalid date format, missing required field).",
        "404 Not Found - Either `fromStation` or `toStation` could not be resolved against the `stations` index.",
        "429 Too Many Requests - The caller exceeded the platform rate limit.",
        "500 Internal Server Error - Elasticsearch or Redis returned an unexpected error.",
      ],
      notes: [
        "The endpoint is public — no authentication is required.",
        "Stations are resolved upstream against the existing `stations` Elasticsearch index, then the schedule index is queried with the resolved UUIDs.",
        "Cache TTL is bounded by `TRAIN_SEARCH_CACHE_TTL_SECONDS`.",
        "`availableSeats` is **capacity**, not live availability. Per-seat live counts are fetched by booking-service from inventory-service at hold time.",
        "Snapshot data is frozen at `SCHEDULE_CREATED` time; edits to the underlying train or route do not trigger a re-projection.",
      ],
    }),
  },
};

/**
 * Search-service OpenAPI metadata.
 *
 * Consumed by `generate-spec.ts` to populate the document's `info` block.
 */
export const apiTitle = "Search Service API";
export const apiVersion = "1.0.0";
export const apiDescription = `
  # Search Service API

  The **Search Service API** exposes read-only search endpoints for the
  IRCTC Railway Booking Platform. It is the canonical source for train
  and station search queries served to end users.

  ## Core Capabilities

  ### Station Autocomplete

  - Suggest Stations — Returns station suggestions for a user-entered
    query term. Backed by an Elasticsearch projection of STATION_*
    admin events.

  ### Train Search

  - Search Trains — Returns trains running between two stations on a
    given date. Backed by an Elasticsearch projection of admin
    SCHEDULE_CREATED events.

`;
