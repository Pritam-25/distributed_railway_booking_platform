import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import type {
  SeatMapService,
  StationSearchService,
  TrainSearchService,
} from "@services";
import type {
  SeatMapParamsDto,
  SeatMapQueryDto,
  StationSuggestQueryDto,
  TrainSearchQueryDto,
} from "@dto";

/**
 * ## SearchController
 * Thin HTTP adapter for search related endpoints.
 *
 * ### Responsibilities
 * - Accepts requests that have already passed route-level validation.
 * - Delegates all business operations to {@link StationSearchService},
 *   {@link TrainSearchService}, and {@link SeatMapService}.
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
   * @param StationSearchService - Service that owns the station-suggest flow.
   * @param trainSearchService - Service that owns the train-search flow.
   * @param seatMapService - Service that owns the seat-map flow.
   */
  constructor(
    private readonly StationSearchService: StationSearchService,
    private readonly trainSearchService: TrainSearchService,
    private readonly seatMapService: SeatMapService,
  ) {}

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

    const stations = await this.StationSearchService.suggestStations(query);

    res.status(statusCode.success).json(
      successResponse("Station suggestions retrieved successfully", {
        count: stations.length,
        stations,
      }),
    );
  }

  /**
   * Retrieves train search results for `(fromStation, toStation, date)`.
   *
   * `GET /api/v1/search/trains`
   *
   * ### Access
   * Public endpoint, no authentication required
   *
   * @param req - Express request with a validated {@link TrainSearchQueryDto}.
   * @param res - Express response returning the train search payload.
   */
  async searchTrains(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as TrainSearchQueryDto;

    const result = await this.trainSearchService.searchTrains(query);

    res
      .status(statusCode.success)
      .json(
        successResponse("Train search results retrieved successfully", result),
      );
  }

  /**
   * Retrieves the seat-map for a schedule between two stations.
   *
   * `GET /api/v1/search/schedules/:scheduleId/seat-map`
   *
   * ### Access
   * Public endpoint, no authentication required — seat selection happens
   * before login in the conversion funnel.
   *
   * @param req - Express request with a validated path {@link SeatMapParamsDto}
   *   and query {@link SeatMapQueryDto}.
   * @param res - Express response returning the seat-map payload.
   */
  async getSeatMap(req: Request, res: Response): Promise<void> {
    const params = req.params as unknown as SeatMapParamsDto;
    const query = req.query as unknown as SeatMapQueryDto;

    const result = await this.seatMapService.getSeatMap(
      params,
      query,
      req.headers as Record<string, string | undefined>,
    );

    res
      .status(statusCode.success)
      .json(successResponse("Seat map retrieved successfully", result));
  }
}
