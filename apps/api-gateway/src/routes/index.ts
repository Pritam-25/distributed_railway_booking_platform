import { Router } from "express";
import { healthRoutes } from "./health.routes.js";
import { docsRouter } from "./docs.routes.js";
import { mountRoutes } from "@routing";

const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/", docsRouter);
mountRoutes(router);

export default router;
