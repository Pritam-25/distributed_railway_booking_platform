import { Router } from "express";
import {
  asyncHandler,
  validateSchema,
  validateQuery,
  validateParams,
} from "@irctc/middleware";
import { routeController } from "@container";
import {
  addStationToRouteSchema,
  updateRouteStationSchema,
  updateRouteStatusSchema,
  listRoutesQuerySchema,
  routeIdParamSchema,
  routeStationIdParamSchema,
} from "@dto";
import { requireAdmin } from "@middleware";

const routeRouter: Router = Router();
const routeStationRouter: Router = Router();

// Require administrator authentication for all routes
routeRouter.use(requireAdmin);
routeStationRouter.use(requireAdmin);

// ------------------- Route Endpoints ------------------- //

/**
 * @route GET /api/v1/admin/routes
 * @desc Retrieve a paginated list of all routes
 */
routeRouter.get(
  "/",
  validateQuery(listRoutesQuerySchema),
  asyncHandler((req, res) => routeController.getAllRoutes(req, res)),
);

/**
 * @route GET /api/v1/admin/routes/:routeId
 * @desc Retrieve a single route by ID with ordered station stops
 */
routeRouter.get(
  "/:routeId",
  validateParams(routeIdParamSchema),
  asyncHandler((req, res) => routeController.getRoute(req, res)),
);

/**
 * @route POST /api/v1/admin/routes/:routeId/stations
 * @desc Add a new station stop to a route
 */
routeRouter.post(
  "/:routeId/stations",
  validateParams(routeIdParamSchema),
  validateSchema(addStationToRouteSchema),
  asyncHandler((req, res) => routeController.addStationToRoute(req, res)),
);

/**
 * @route DELETE /api/v1/admin/routes/:routeId
 * @desc Soft delete / deactivate a route by ID
 */
routeRouter.delete(
  "/:routeId",
  validateParams(routeIdParamSchema),
  asyncHandler((req, res) => routeController.deleteRoute(req, res)),
);

/**
 * @route PATCH /api/v1/admin/routes/:routeId/status
 * @desc Activate or deactivate a route by ID
 */
routeRouter.patch(
  "/:routeId/status",
  validateParams(routeIdParamSchema),
  validateSchema(updateRouteStatusSchema),
  asyncHandler((req, res) => routeController.updateRouteStatus(req, res)),
);

// ------------------- RouteStation Endpoints ------------------- //

/**
 * @route PATCH /api/v1/admin/route-stations/:routeStationId
 * @desc Update route station stop sequence details
 */
routeStationRouter.patch(
  "/:routeStationId",
  validateParams(routeStationIdParamSchema),
  validateSchema(updateRouteStationSchema),
  asyncHandler((req, res) => routeController.updateRouteStation(req, res)),
);

/**
 * @route DELETE /api/v1/admin/route-stations/:routeStationId
 * @desc Physically remove a station stop from a route
 */
routeStationRouter.delete(
  "/:routeStationId",
  validateParams(routeStationIdParamSchema),
  asyncHandler((req, res) => routeController.removeRouteStation(req, res)),
);

export { routeRouter, routeStationRouter };
