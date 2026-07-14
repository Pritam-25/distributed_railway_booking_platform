import { Router } from "express";
import healthRoutes from "./health.routes.js";
import stationRoutes from "./station.routes.js";
import trainRoutes from "./train.routes.js";
import adminAuthRoutes from "./auth.routes.js";
import coachRoutes from "./coach.routes.js";
import { routeRouter, routeStationRouter } from "./route.routes.js";
import scheduleRouter from "./schedule.routes.js";

const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/admin/stations", stationRoutes);
router.use("/admin/trains", trainRoutes);
router.use("/admin/auth", adminAuthRoutes);
router.use("/admin/coaches", coachRoutes);
router.use("/admin/routes", routeRouter);
router.use("/admin/route-stations", routeStationRouter);
router.use("/admin/schedules", scheduleRouter);

export {
  router,
  healthRoutes,
  stationRoutes,
  trainRoutes,
  adminAuthRoutes,
  coachRoutes,
  routeRouter,
  routeStationRouter,
  scheduleRouter,
};
export default router;
