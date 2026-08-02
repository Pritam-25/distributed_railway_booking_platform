import { Router } from "express";
import healthRoutes from "./health.routes.js";
import searchRoutes from "./search.routes.js";

/**
 * Binds `/health` to {@link healthRoutes} and `/search` to {@link searchRoutes}.
 * No auth — Public endpoints.
 */
const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/search", searchRoutes);

export { router, healthRoutes, searchRoutes };
export default router;
