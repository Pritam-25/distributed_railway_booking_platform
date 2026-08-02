import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import type { SearchService } from "@services";
import type { StationSuggestQueryDto } from "@dto";

/**
 * ## SearchController
 * Thin HTTP adapter for search related endpoints.
 *
 * ### Responsibilities
 * - Accepts requests that have already passed route-level validation.
 * - Delegates all business operations to {@link SearchService}.
 * - Translates service results into the project's standard
 *   {@link successResponse} envelope.
 * - Leaves business rules, ranking, and persistence to the service layer.
 *
 * ### Error Handling
 * - Does not catch errors; they propagate to the global error handler.
 * - Never throws `ApiError` or any other error type; service layer handles that.
 */
export class SearchController {
  /**
   * Creates a new SearchController.
   *
   * @param searchService - Service that owns the suggest flow.
   */
  constructor(private readonly searchService: SearchService) {}

  /**
   * Retrieves station suggestions for an autocomplete query.
   *
   * `GET /api/v1/search/stations/suggest`
   *
   * ### Access
   * Public endpoint, no authentication required
   *
   * @param req - Express request with a validated {@link StationSuggestQueryDto}.
   * @param res - Express response returning the station suggestions.
   */
  async suggestStations(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as StationSuggestQueryDto;

    const stations = await this.searchService.suggestStations(query);

    res.status(statusCode.success).json(
      successResponse("Station suggestions retrieved successfully", {
        count: stations.length,
        stations,
      }),
    );
  }
}
