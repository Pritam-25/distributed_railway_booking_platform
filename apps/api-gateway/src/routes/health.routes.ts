import { createHealthRouter, type HealthDependency } from "@irctc/http";
import { checkRedisHealth } from "@irctc/redis";
import { redis } from "@config";

/**
 * Dependencies for Kubernetes readiness probes.
 * - redis: checks the Redis connection using the PING command
 */
const healthDependencies: HealthDependency[] = [
  { name: "redis", check: () => checkRedisHealth(redis) },
];

/**
 * Routes to check the health of the API gateway.
 */
export const healthRoutes = createHealthRouter({
  dependencies: healthDependencies,
});
