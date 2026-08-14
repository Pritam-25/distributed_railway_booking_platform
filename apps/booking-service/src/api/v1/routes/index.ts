import { Router } from "express";
import healthRoutes from "./health.routes.js";
import { bookingRoutes } from "./booking.routes.js";

const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/bookings", bookingRoutes);

export { router, healthRoutes, bookingRoutes };
export default router;
