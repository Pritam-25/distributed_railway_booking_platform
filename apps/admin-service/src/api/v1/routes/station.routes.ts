import { Router } from "express";
import {
  asyncHandler,
  validateSchema,
  validateQuery,
  validateParams,
} from "@irctc/middleware";
import { stationController } from "@container";
import {
  createStationSchema,
  updateStationSchema,
  listStationsQuerySchema,
  stationIdParamSchema,
} from "@dto";

import { requireAdmin } from "@middleware";

const router: Router = Router();

/**
 * all routes are private (Admin only via Gateway)
 */
router.use(requireAdmin);

/**
 * @route POST /api/v1/stations
 * @desc Create a new station in the system
 */
router.post(
  "/",
  validateSchema(createStationSchema),
  asyncHandler((req, res) => stationController.createStation(req, res)),
);

/**
 * @route GET /api/v1/stations/:stationId
 * @desc Retrieve a station by its unique ID
 */
router.get(
  "/:stationId",
  validateParams(stationIdParamSchema),
  asyncHandler((req, res) => stationController.getStation(req, res)),
);

/**
 * @route GET /api/v1/stations
 * @desc Retrieve a list of all stations with optional filtering and pagination
 */
router.get(
  "/",
  validateQuery(listStationsQuerySchema),
  asyncHandler((req, res) => stationController.getAllStations(req, res)),
);

/**
 * @route PATCH /api/v1/stations/:stationId
 * @desc Update station details by its ID
 */
router.patch(
  "/:stationId",
  validateParams(stationIdParamSchema),
  validateSchema(updateStationSchema),
  asyncHandler((req, res) => stationController.updateStation(req, res)),
);

/**
 * @route PATCH /api/v1/stations/:stationId/deactivate
 * @desc Deactivate a station by its ID
 */
router.patch(
  "/:stationId/deactivate",
  validateParams(stationIdParamSchema),
  asyncHandler((req, res) => stationController.deactivateStation(req, res)),
);

export default router;
