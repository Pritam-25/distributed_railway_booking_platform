import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { docsRouter } from "./docs.routes.js";
import { mountRoutes } from "@routing";

const router: Router = Router();

router.use("/health", healthRouter);
router.use("/", docsRouter);
mountRoutes(router);

export default router;
