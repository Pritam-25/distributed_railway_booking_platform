import { Router } from "express";
import healthRoutes from "./health.routes.js";

const router: Router = Router();

export { router, healthRoutes };
export default router;
