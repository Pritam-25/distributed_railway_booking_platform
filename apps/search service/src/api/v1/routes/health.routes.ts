import { Router } from "express";
import { liveCheck, readyCheck } from "@controllers";

/**
 * Binds `/health/live` to {@link liveCheck} and `/health/ready` to {@link readyCheck}.
 * No auth — k8s probes only.
 */
const router: Router = Router();

router.get("/live", liveCheck);
router.get("/ready", readyCheck);

export default router;
