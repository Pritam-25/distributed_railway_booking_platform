import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import type { RouteService } from "@services";
import type {
  AddStationToRouteRequestDto,
  UpdateRouteStationRequestDto,
  UpdateRouteStatusRequestDto,
  ListRoutesQueryDto,
} from "@dto";

/**
 * Controller class orchestrating Train Route and RouteStation HTTP request mappings.
 */
export class RouteController {
  constructor(private readonly service: RouteService) {}

  /**
   * Handler for creating a new route.
   *
   * @param req Express request object containing the creation request body.
   * @param res Express response object.
   */
  async createRoute(req: Request, res: Response): Promise<void> {
    const { trainId } = req.params;
    const route = await this.service.createRoute({ trainId: trainId! });
    res
      .status(statusCode.created)
      .json(successResponse("Route created successfully", route));
  }

  /**
   * Handler for retrieving a route by its unique ID.
   *
   * @param req Express request object containing the route ID.
   * @param res Express response object.
   */
  async getRoute(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    const route = await this.service.getRoute(routeId!);
    res
      .status(statusCode.success)
      .json(successResponse("Route retrieved successfully", route));
  }

  /**
   * Handler for retrieving a list of all routes.
   *
   * @param req Express request object.
   * @param res Express response object.
   */
  async getAllRoutes(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListRoutesQueryDto;
    const result = await this.service.listRoutes(query);
    res
      .status(statusCode.success)
      .json(
        successResponse(
          "Routes retrieved successfully",
          result.data,
          result.metadata,
        ),
      );
  }

  /**
   * Handler for adding a new station to a route.
   *
   * @param req Express request object containing the route ID and station details.
   * @param res Express response object.
   */
  async addStationToRoute(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    const dto = req.body as AddStationToRouteRequestDto;
    const stop = await this.service.addStationToRoute(routeId!, dto);
    res
      .status(statusCode.created)
      .json(successResponse("Station stop added to route successfully", stop));
  }

  /**
   * Handler for updating an existing station stop details.
   *
   * @param req Express request object containing the route station ID and station details.
   * @param res Express response object.
   */
  async updateRouteStation(req: Request, res: Response): Promise<void> {
    const { routeStationId } = req.params;
    const dto = req.body as UpdateRouteStationRequestDto;
    const stop = await this.service.updateRouteStation(routeStationId!, dto);
    res
      .status(statusCode.success)
      .json(successResponse("Route station stop updated successfully", stop));
  }

  /**
   * Handler for removing a station stop from a route.
   *
   * @param req Express request object containing the route station ID.
   * @param res Express response object.
   */
  async removeRouteStation(req: Request, res: Response): Promise<void> {
    const { routeStationId } = req.params;
    await this.service.removeRouteStation(routeStationId!);
    res
      .status(statusCode.success)
      .json(successResponse("Route station stop removed successfully", null));
  }

  /**
   * Handler for deleting/deactivating a route.
   *
   * @param req Express request object containing the route ID.
   * @param res Express response object.
   */
  async deleteRoute(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    const route = await this.service.deleteRoute(routeId!);
    res
      .status(statusCode.success)
      .json(successResponse("Route deactivated successfully", route));
  }

  /**
   * Handler for updating a route's active status (isActive).
   *
   * @param req Express request object containing the route ID and status.
   * @param res Express response object.
   */
  async updateRouteStatus(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    const dto = req.body as UpdateRouteStatusRequestDto;
    const route = await this.service.updateRouteStatus(routeId!, dto.isActive);
    res
      .status(statusCode.success)
      .json(successResponse("Route status updated successfully", route));
  }
}
