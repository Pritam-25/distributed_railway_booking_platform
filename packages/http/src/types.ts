/**
 * Re-export health check contracts from the dedicated health domain module.
 */
export type {
  HealthCheckResult,
  HealthDependency,
  HealthChecks,
  CreateHealthRouterOptions,
} from "./health/types.js";

/**
 * A tuple defining a timed lifecycle step.
 * `[label, action, timeoutMs?]`
 */
export type BoundedStep = [
  label: string,
  action: () => Promise<unknown>,
  timeoutMs?: number,
];
