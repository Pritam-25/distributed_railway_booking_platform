import { Router } from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.route.js";
import healthRoutes from "./health.routes.js";

const router: Router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/health", healthRoutes);

export { router, healthRoutes };
export default router;
