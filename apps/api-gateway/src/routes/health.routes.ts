/**
 * ## routes/health
 *
 * `api-gateway` Kubernetes-friendly liveness and readiness probe routes.
 * Delegates to `createHealthRouter` from `@irctc/http` and the
 * per-service adapters from `health/dependencies.ts`.
 *
 * Mounted at `/health` by `routes/index.ts`. Probes registered: redis
 * (see `healthDependencies`).
 */
import { createHealthRouter } from "@irctc/http";
import { healthDependencies } from "../health/dependencies.js";

export const healthRouter = createHealthRouter({
  dependencies: healthDependencies,
});
