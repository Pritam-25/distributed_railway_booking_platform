import { Router } from "express";
import {
  asyncHandler,
  validateSchema,
  validateQuery,
  validateParams,
} from "@irctc/middleware";
import { coachController, routeController, trainController } from "@container";
import {
  createTrainSchema,
  updateTrainSchema,
  listTrainsQuerySchema,
  trainIdParamSchema,
  updateOperatingDaysSchema,
  createCoachSchema,
} from "@dto";
import { requireAdmin } from "@middleware";

const router: Router = Router();

/**
 * all routes are private (Admin only via Gateway)
 */
router.use(requireAdmin);

/**
 * @route POST /api/v1/trains
 * @desc Create a new train in the system
 */
router.post(
  "/",
  validateSchema(createTrainSchema),
  asyncHandler((req, res) => trainController.createTrain(req, res)),
);

/**
 * @route GET /api/v1/trains/:trainId
 * @desc Retrieve a train by its unique ID
 */
router.get(
  "/:trainId",
  validateParams(trainIdParamSchema),
  asyncHandler((req, res) => trainController.getTrain(req, res)),
);

/**
 * @route GET /api/v1/trains
 * @desc Retrieve a list of all trains with optional filtering and pagination
 * @query {string} [trainNumber] - Filter by exact train number (e.g., "12002")
 * @query {string} [category] - Filter by train category (e.g., "RAJDHANI", "SHATABDI", "VANDE_BHARAT", etc.)
 * @query {boolean} [isActive] - Filter by active status ("true" or "false")
 * @query {number} [page=1] - Page number for pagination (defaults to 1)
 * @query {number} [limit=10] - Number of records per page (defaults to 10, max 100)
 * @example GET /api/v1/trains?category=VANDE_BHARAT&isActive=true&page=1&limit=10
 */
router.get(
  "/",
  validateQuery(listTrainsQuerySchema),
  asyncHandler(async (req, res) => {
    return trainController.getAllTrains(req, res);
  }),
);

/**
 * @route PATCH /api/v1/trains/:trainId
 * @desc Update train details by its ID
 */
router.patch(
  "/:trainId",
  validateParams(trainIdParamSchema),
  validateSchema(updateTrainSchema),
  asyncHandler((req, res) => trainController.updateTrain(req, res)),
);

/**
 * @route PATCH /api/v1/trains/:trainId/deactivate
 * @desc Deactivate a train by its ID
 */
router.patch(
  "/:trainId/deactivate",
  validateParams(trainIdParamSchema),
  asyncHandler((req, res) => trainController.deactivateTrain(req, res)),
);

/**
 * @route POST /api/v1/trains/:trainId/routes
 * @desc Create a shell route for a train
 */
router.post(
  "/:trainId/routes",
  validateParams(trainIdParamSchema),
  asyncHandler(async (req, res) => {
    return routeController.createRoute(req, res);
  }),
);

/**
 * @route GET /api/v1/trains/:trainId/coaches
 * @desc Retrieve all coaches belonging to a train
 */
router.get(
  "/:trainId/coaches",
  validateParams(trainIdParamSchema),
  asyncHandler(async (req, res) => {
    return coachController.getAllCoaches(req, res);
  }),
);

/**
 * @route POST /api/v1/trains/:trainId/coaches
 * @desc Add a new coach to a train
 */
router.post(
  "/:trainId/coaches",
  validateParams(trainIdParamSchema),
  validateSchema(createCoachSchema),
  asyncHandler(async (req, res) => {
    return coachController.createCoach(req, res);
  }),
);

/**
 * @route POST /api/v1/trains/:trainId/operating-days
 * @desc Update the operating days of a train
 */
router.post(
  "/:trainId/operating-days",
  validateParams(trainIdParamSchema),
  validateSchema(updateOperatingDaysSchema),
  asyncHandler((req, res) =>
    trainController.updateTrainOperatingDays(req, res),
  ),
);

export default router;
