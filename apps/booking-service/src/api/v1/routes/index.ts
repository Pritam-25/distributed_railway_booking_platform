import { Router } from "express";
import healthRoutes from "./health.routes.js";

const router: Router = Router();

router.use("/health", healthRoutes);

export { router, healthRoutes };
export default router;
