import { Router } from "express";
import {
  asyncHandler,
  validateSchema,
  validateQuery,
  validateParams,
} from "@irctc/middleware";
import { scheduleController } from "@container";
import {
  createScheduleSchema,
  updateScheduleStatusSchema,
  listSchedulesQuerySchema,
  scheduleIdParamSchema,
} from "@dto";
import { requireAdmin } from "@middleware";

const router: Router = Router();

// Require admin authentication for all schedule operations
router.use(requireAdmin);

/**
 * @route POST /api/v1/admin/schedules
 * @desc Create a new train schedule departure run
 */
router.post(
  "/",
  validateSchema(createScheduleSchema),
  asyncHandler((req, res) => scheduleController.createSchedule(req, res)),
);

/**
 * @route GET /api/v1/admin/schedules
 * @desc List and paginate train schedules
 */
router.get(
  "/",
  validateQuery(listSchedulesQuerySchema),
  asyncHandler((req, res) => scheduleController.getAllSchedules(req, res)),
);

/**
 * @route GET /api/v1/admin/schedules/:scheduleId
 * @desc Retrieve details for a schedule
 */
router.get(
  "/:scheduleId",
  validateParams(scheduleIdParamSchema),
  asyncHandler((req, res) => scheduleController.getSchedule(req, res)),
);

/**
 * @route PATCH /api/v1/admin/schedules/:scheduleId/status
 * @desc Transition/update schedule status
 */
router.patch(
  "/:scheduleId/status",
  validateParams(scheduleIdParamSchema),
  validateSchema(updateScheduleStatusSchema),
  asyncHandler((req, res) => scheduleController.updateScheduleStatus(req, res)),
);

export default router;
