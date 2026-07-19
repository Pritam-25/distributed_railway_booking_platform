import { Router } from "express";
import {
  asyncHandler,
  validateSchema,
  validateParams,
} from "@irctc/middleware";
import { coachController, seatController } from "@container";
import {
  updateCoachSchema,
  coachIdParamSchema,
  coachAndSeatIdParamSchema,
} from "@dto";

import { requireAdmin } from "@middleware";

const router: Router = Router();

router.use(requireAdmin);

/**
 * @route GET /api/v1/coaches/:coachId
 * @desc Retrieve a coach by its ID
 */
router.get(
  "/:coachId",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => coachController.getCoach(req, res)),
);

/**
 * @route PATCH /api/v1/coaches/:coachId
 * @desc Update a coach by its ID
 */
router.patch(
  "/:coachId",
  validateParams(coachIdParamSchema),
  validateSchema(updateCoachSchema),
  asyncHandler((req, res) => coachController.updateCoach(req, res)),
);

/**
 * @route DELETE /api/v1/coaches/:coachId
 * @desc Delete a coach by its ID
 */
router.delete(
  "/:coachId",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => coachController.deleteCoach(req, res)),
);

/**
 * @route POST /api/v1/coaches/:coachId/seats
 * @desc Bulk create seat templates for a coach
 */
router.post(
  "/:coachId/seats",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => seatController.bulkCreateSeats(req, res)),
);

/**
 * @route GET /api/v1/coaches/:coachId/seats
 * @desc Retrieve all seat templates for a coach
 */
router.get(
  "/:coachId/seats",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => seatController.getSeats(req, res)),
);

/**
 * @route GET /api/v1/coaches/:coachId/seats/:seatId
 * @desc Retrieve a single seat template by ID
 */
router.get(
  "/:coachId/seats/:seatId",
  validateParams(coachAndSeatIdParamSchema),
  asyncHandler((req, res) => seatController.getSeat(req, res)),
);

/**
 * @route DELETE /api/v1/coaches/:coachId/seats
 * @desc Reset (delete) all seat templates for a coach
 */
router.delete(
  "/:coachId/seats",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => seatController.resetSeats(req, res)),
);

export default router;
