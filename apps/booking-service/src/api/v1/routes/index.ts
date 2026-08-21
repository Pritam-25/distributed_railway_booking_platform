import { Router } from "express";
import healthRoutes from "./health.routes.js";
import { bookingRoutes } from "./booking.routes.js";
import { bookingEventsRoutes } from "../../../sse/booking-events.routes.js";

const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/bookings", bookingRoutes);
router.use("/bookings", bookingEventsRoutes);

export { router, healthRoutes, bookingRoutes, bookingEventsRoutes };
export default router;
