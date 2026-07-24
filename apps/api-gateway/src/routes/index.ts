import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { docsRouter } from "./docs.routes.js";

const router: Router = Router();

router.use("/health", healthRouter);
router.use("/", docsRouter);

export default router;
