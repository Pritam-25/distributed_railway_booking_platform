import { Router } from "express";
import { liveCheck, readyCheck } from "@controllers";

const router: Router = Router();

router.get("/live", liveCheck);
router.get("/ready", readyCheck);

export default router;
