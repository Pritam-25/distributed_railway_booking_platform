import { Router } from "express";
import { z } from "zod";
import {
  trustGatewayHeaders,
  asyncHandler,
  validateParams,
} from "@irctc/middleware";

import { seatEventsController } from "@container";

const scheduleIdParamSchema = z.object({
  scheduleId: z.uuid("scheduleId must be a valid UUID"),
});

/**
 * SSE schedule seat events routes.
 *
 * Mount under `/schedules` in `routes/index.ts`.
 */
const router: Router = Router();

router.use(trustGatewayHeaders);

router.get(
  "/:scheduleId/seat-events",
  validateParams(scheduleIdParamSchema),
  asyncHandler((req, res) => seatEventsController.stream(req, res)),
);

export { router as seatEventsRoutes };
