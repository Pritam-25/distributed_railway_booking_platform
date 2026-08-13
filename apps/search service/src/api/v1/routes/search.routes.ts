import { Router } from "express";
import { asyncHandler, validateParams, validateQuery } from "@irctc/middleware";
import { searchController } from "@container";
import {
  seatMapParamsSchema,
  seatMapQuerySchema,
  stationSuggestQuerySchema,
  trainSearchQuerySchema,
} from "@dto";

/**
 * Public search endpoints.
 *
 * Registers HTTP endpoints for station and train search requests and applies
 * request validation before delegating to {@link SearchController}.
 *
 * ### Responsibilities:
 * - Route incoming search requests (`/api/v1/search/*`)
 * - Apply parameter and query validation via Zod schemas.
 * - Delegate execution to {@link SearchController}.
 *
 * ### Middleware Pipeline
 * - {@link validateParams} / {@link validateQuery} — Validate path and query
 *   parameters against Zod schemas.
 * - {@link asyncHandler} — Catches unhandled async exceptions and routes them to global error handler.
 */
const router: Router = Router();

//  Suggest stations for an autocomplete query.
router.get(
  "/stations/suggest",
  validateQuery(stationSuggestQuerySchema),
  asyncHandler(async (req, res) => {
    await searchController.suggestStations(req, res);
  }),
);

//  Search trains by from/to station and date.
router.get(
  "/trains",
  validateQuery(trainSearchQuerySchema),
  asyncHandler(async (req, res) => {
    await searchController.searchTrains(req, res);
  }),
);

//  Retrieve the seat-map for a schedule segment.
router.get(
  "/schedules/:scheduleId/seat-map",
  validateParams(seatMapParamsSchema),
  validateQuery(seatMapQuerySchema),
  asyncHandler(async (req, res) => {
    await searchController.getSeatMap(req, res);
  }),
);

export default router;
