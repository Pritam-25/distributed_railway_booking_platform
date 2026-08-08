import {
  CommonErrorResponses,
  OpenAPIRegistry,
  SuccessResponseSchema,
  createErrorResponseSchema,
  createOpenApiResponse,
  registerGatewayAuth,
} from "@irctc/openapi";
import {
  stationSuggestQuerySchema,
  stationSuggestResponseSchema,
  trainSearchQuerySchema,
  trainSearchResponseSchema,
} from "@dto";
import { ERROR_CODES, ERROR_MESSAGES } from "@utils/errors";
import { searchServiceOpenApiDescriptions } from "./descriptions.js";

/**
 * ## Search Service OpenAPI Registry
 *
 * Registers every public search-service endpoint plus the response
 * components that orval reads when generating the frontend SDK.
 */

export const registry = new OpenAPIRegistry();

/**
 * Bearer JWT and HTTP-only cookie security schemes.
 *
 * Search-service endpoints are public — no auth required — so the per-path
 * `security` field is set to `[]` (override the default). The scheme is
 * still declared so OpenAPI consumers understand the platform's auth model.
 */
registerGatewayAuth(registry);

/**
 * Component schemas shared across response bodies.
 */
registry.register("StationSuggestResponse", stationSuggestResponseSchema);
registry.register("TrainSearchResponse", trainSearchResponseSchema);

// ─── Search Endpoints ───────────────────────────────────────────────────────

/**
 * GET /api/v1/search/stations/suggest
 *
 * Autocomplete suggestions for a station name or code. Public endpoint.
 * Backed by an Elasticsearch projection of `STATION_*` events plus a
 * Redis read-through cache.
 */
registry.registerPath({
  method: "get",
  path: "/api/v1/search/stations/suggest",
  operationId: "suggestStations",
  tags: ["Search"],
  summary: searchServiceOpenApiDescriptions.search.suggestStations.summary,
  description:
    searchServiceOpenApiDescriptions.search.suggestStations.description,
  security: [],
  request: {
    query: stationSuggestQuerySchema,
  },
  responses: {
    200: createOpenApiResponse(
      "Station suggestions retrieved successfully",
      SuccessResponseSchema(
        stationSuggestResponseSchema,
        "Station suggestions retrieved successfully",
      ),
    ),
    ...CommonErrorResponses,
  },
});

/**
 * GET /api/v1/search/trains
 *
 * Returns trains running between two stations on a given date, with
 * timing, fare range, capacity, and operating-days metadata. Public
 * endpoint.
 *
 * `fromStation` and `toStation` accept either a station code (e.g. `NDLS`)
 * or a UUID. Pagination via `limit` (default 10, max 50) and `offset`
 * (default 0).
 */
registry.registerPath({
  method: "get",
  path: "/api/v1/search/trains",
  operationId: "searchTrains",
  tags: ["Search"],
  summary: searchServiceOpenApiDescriptions.search.searchTrains.summary,
  description: searchServiceOpenApiDescriptions.search.searchTrains.description,
  security: [],
  request: {
    query: trainSearchQuerySchema,
  },
  responses: {
    200: createOpenApiResponse(
      "Train search results retrieved successfully",
      SuccessResponseSchema(
        trainSearchResponseSchema,
        "Train search results retrieved successfully",
      ),
    ),
    ...CommonErrorResponses,
    404: createOpenApiResponse(
      "One or both stations could not be resolved.",
      createErrorResponseSchema(
        ERROR_CODES.STATION_NOT_FOUND,
        ERROR_MESSAGES.STATION_NOT_FOUND,
      ),
    ),
  },
});
