import type { CreateStationRequestDto, ListStationsQueryDto } from "@dto";
import type { StationService } from "@services";
import type { Request, Response } from "express";
import { statusCode, successResponse, paginatedResponse } from "@irctc/http";

/**
 * Controller class that handles incoming HTTP requests for station management.
 * Acts as the entrypoint for Express routes and delegates business logic processing to the StationService.
 * validates request payloads and formats responses according to the API contract.
 */
export class StationController {
  /**
   * Creates an instance of StationController.
   * @param service The StationService instance used to handle station business operations.
   */
  constructor(private readonly service: StationService) {}

  /**
   * Handler for creating a new station.
   *
   * @param req Express request object containing the creation request body.
   * @param res Express response object.
   */
  async createStation(req: Request, res: Response): Promise<void> {
    const stationData: CreateStationRequestDto = req.body;
    const newStation = await this.service.createStation(stationData);
    res
      .status(statusCode.created)
      .json(successResponse("Station created successfully", newStation));
  }

  /**
   * Handler for retrieving a station by its ID.
   *
   * @param req Express request object containing the station ID parameter.
   * @param res Express response object.
   */
  async getStation(req: Request, res: Response): Promise<void> {
    const { stationId } = req.params;
    const station = await this.service.getStationById(stationId!);
    res
      .status(statusCode.success)
      .json(successResponse("Station retrieved successfully", station));
  }

  /**
   * Handler for retrieving all stations.
   *
   * @param req Express request object containing query filter parameters.
   * @param res Express response object.
   * @throws {ApiError} If the query parameters fail schema validation.
   */
  async getAllStations(req: Request, res: Response): Promise<void> {
    const stations = await this.service.listStations(
      req.query as unknown as ListStationsQueryDto,
    );
    res
      .status(statusCode.success)
      .json(paginatedResponse("Stations retrieved successfully", stations));
  }

  /**
   * Handler for updating an existing station by its ID.
   *
   * @param req Express request object containing the station ID parameter and the updated fields in body.
   * @param res Express response object.
   */
  async updateStation(req: Request, res: Response): Promise<void> {
    const { stationId } = req.params;
    const stationData: CreateStationRequestDto = req.body;
    const updatedStation = await this.service.updateStation(
      stationId!,
      stationData,
    );
    res
      .status(statusCode.success)
      .json(successResponse("Station updated successfully", updatedStation));
  }

  /**
   * Handler for deactivating a station by its ID.
   *
   * @param req Express request object containing the station ID parameter.
   * @param res Express response object.
   */
  async deactivateStation(req: Request, res: Response): Promise<void> {
    const { stationId } = req.params;

    const deactivatedStation = await this.service.deactivateStation(stationId!);
    res
      .status(statusCode.success)
      .json(
        successResponse("Station deactivated successfully", deactivatedStation),
      );
  }
}
