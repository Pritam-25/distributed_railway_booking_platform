import { Router } from "express";
import healthRoutes from "./health.routes.js";
import { bookingRoutes } from "./booking.routes.js";
import { bookingEventsRoutes } from "../../../sse/routes/booking-events.routes.js";
import { seatEventsRoutes } from "../../../sse/routes/seat-events.routes.js";

const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/bookings", bookingRoutes);
router.use("/bookings", bookingEventsRoutes);
router.use("/schedules", seatEventsRoutes);

export {
  router,
  healthRoutes,
  bookingRoutes,
  bookingEventsRoutes,
  seatEventsRoutes,
};

export default router;
