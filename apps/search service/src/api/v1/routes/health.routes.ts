/**
 * ## routes/health
 *
 * `search-service` Kubernetes-friendly liveness and readiness probe
 * routes. Delegates to `createHealthRouter` from `@irctc/http` and the
 * per-service adapters from `health/dependencies.ts`.
 *
 * Mounted at `/health` by `routes/index.ts`. Probes registered:
 * elasticsearch, redis, kafka (see `healthDependencies`).
 */
import { createHealthRouter } from "@irctc/http";
import { healthDependencies } from "@health";

const healthRoutes = createHealthRouter({
  dependencies: healthDependencies,
});

export default healthRoutes;
