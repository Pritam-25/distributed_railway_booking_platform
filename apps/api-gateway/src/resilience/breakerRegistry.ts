import {
  CircuitBreakerRegistry,
  type CircuitBreakerState,
} from "@irctc/resilience";
import { logger } from "@irctc/logger";
import { TIMEOUTS, DEFAULT_TIMEOUT_MS } from "./timeouts.js";

/**
 * Singleton circuit-breaker registry shared across all proxy requests.
 *
 * Each upstream service gets its own named breaker (keyed by
 * `circuitName` from the upstream config). State transitions are
 * logged at WARN so they show up in Grafana/Loki dashboards.
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry({
  logger,
  onStateChange: (
    name: string,
    from: CircuitBreakerState,
    to: CircuitBreakerState,
  ) => {
    logger.warn(
      { module: "circuit-breaker", circuit: name, from, to },
      `Circuit "${name}" transitioned from ${from} → ${to}`,
    );
  },
});

/** Default options applied to every upstream on first registration. */
const CB_DEFAULTS = {
  failureThreshold: 5,
  successThreshold: 3,
  recoveryTimeout: 30_000,
} as const;

/**
 * Names that have already been registered with options.
 *
 * `CircuitBreakerRegistry.get(name, options)` THROWS if called twice
 * with options — options are immutable after first registration.
 * We must NOT pass options on subsequent lookups, so we track which
 * names have been registered and only supply options on the first call.
 */
const registeredBreakers = new Set<string>();

/**
 * Returns the breaker for `circuitName`, creating it on first call.
 *
 * Subsequent calls for the same `circuitName` return the existing
 * breaker without re-applying options. This is the only safe way
 * to look up a breaker from the per-request hot path.
 */
export const getBreaker = (circuitName: string) => {
  if (registeredBreakers.has(circuitName)) {
    return circuitBreakerRegistry.get(circuitName);
  }
  registeredBreakers.add(circuitName);
  return circuitBreakerRegistry.get(circuitName, {
    ...CB_DEFAULTS,
    timeoutMs: TIMEOUTS[circuitName] ?? DEFAULT_TIMEOUT_MS,
  });
};
