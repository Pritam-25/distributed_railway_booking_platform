import { Router } from "express";
import { asyncHandler, validateQuery } from "@irctc/middleware";
import { searchController } from "@container";
import { stationSuggestQuerySchema } from "@dto";

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
 * - {@link validateQuery} — Validates request query parameters against Zod schemas.
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

export default router;
