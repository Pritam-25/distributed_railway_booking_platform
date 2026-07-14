import { Router } from "express";
import { liveCheck, readyCheck } from "@health";

/**
 * Health routes for the api-gateway. Mounted at `/health` by
 * `src/routes/index.ts`.
 *
 * - `GET /health/live`  — liveness, no deps
 * - `GET /health/ready` — readiness, bounded Redis probe
 */
export const healthRouter: Router = Router();

healthRouter.get("/live", liveCheck);
healthRouter.get("/ready", readyCheck);
