/**
 * ## module/health/types
 *
 * The contract a service implements to register a readiness probe with
 * `createHealthRouter`. The framework owns the iteration, dedup, and
 */

/**
 * Result of a single readiness probe.
 */
export interface HealthCheckResult {
  /** Probe name. Used as the key in the `checks` map. */
  name: string;
  /** Whether the dependency was reachable and answered correctly. */
  ok: boolean;
  /** Wall-clock latency of the probe in milliseconds. */
  latencyMs: number;
  /** Human-readable failure reason; populated only when `ok === false`. */
  error?: string;
}

/**
 * Map of probe name to its result. Aggregated by `createHealthRouter`.
 */
export type HealthChecks = Record<string, HealthCheckResult>;

/**
 * Adapter contract for a single readiness probe.
 *
 * Implementations live in each service (e.g.
 * `apps/user-service/src/health/dependencies.ts`). They must:
 *
 * - Convert every failure into `{ ok: false, error }`. Never throw.
 * - Be cheap enough to run on every `/health/ready` request, OR
 *   deduplicate via a module-level singleton (see the existing user-service
 *   probes for the pattern).
 * - Return within `probeTimeoutMs` (default 5s); the router bounds them.
 */
export interface HealthDependency {
  /** Probe name. Used as the key in the `checks` map. */
  name: string;
  /** Executes the probe and returns its result. Never throws. */
  check: () => Promise<HealthCheckResult>;
}
