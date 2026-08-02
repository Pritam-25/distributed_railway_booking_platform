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

/**
 * Admin coach routes.
 *
 * Registers HTTP endpoints for admin coach operations, applying validation
 * and authorization middleware before delegating to {@link CoachController}.
 *
 * ### Responsibilities
 * - Route incoming coach management requests (`/api/v1/coaches`).
 * - Apply parameter and request body validation via Zod schemas.
 * - Delegate execution to {@link CoachController}.
 *
 * ### Middleware Pipeline
 * - {@link requireAdmin} — Requires authentication and authorization for admin users.
 * - {@link validateParams} — Validates request path parameters against Zod schemas.
 * - {@link validateSchema} — Validates request body payloads against Zod schemas.
 * - {@link asyncHandler} — Catches unhandled async exceptions and routes them to global error middleware.
 *
 * @remarks
 * Contains no business logic. All business exceptions propagate to global error handling via {@link asyncHandler}.
 */
const router: Router = Router();

router.use(requireAdmin);

// Retrieve a coach by its ID
router.get(
  "/:coachId",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => coachController.getCoach(req, res)),
);

// Update a coach by its ID
router.patch(
  "/:coachId",
  validateParams(coachIdParamSchema),
  validateSchema(updateCoachSchema),
  asyncHandler((req, res) => coachController.updateCoach(req, res)),
);

// Delete a coach by its ID
router.delete(
  "/:coachId",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => coachController.deleteCoach(req, res)),
);

// Bulk create seat templates for a coach
router.post(
  "/:coachId/seats",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => seatController.bulkCreateSeats(req, res)),
);

// Retrieve all seat templates for a coach
router.get(
  "/:coachId/seats",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => seatController.getSeats(req, res)),
);

// Retrieve a single seat template by ID
router.get(
  "/:coachId/seats/:seatId",
  validateParams(coachAndSeatIdParamSchema),
  asyncHandler((req, res) => seatController.getSeat(req, res)),
);

// Reset (delete) all seat templates for a coach
router.delete(
  "/:coachId/seats",
  validateParams(coachIdParamSchema),
  asyncHandler((req, res) => seatController.resetSeats(req, res)),
);

export default router;
