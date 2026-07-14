import { env } from "@config";

/**
 * Named rate-limit presets applied per route. The preset name is
 * referenced from `config/routes.ts` and resolved by
 * `ratelimit/rateLimitMiddleware.ts`.
 *
 * Defaults:
 * - `default` — generous bucket for general API traffic (100 tokens, refills at ~1.67/s)
 * - `auth`    — tight bucket for credential-bearing endpoints (10 tokens, refills at ~0.17/s)
 *
 * Override via env (`RATE_LIMIT_DEFAULT_CAPACITY`, `RATE_LIMIT_AUTH_*`) to
 * tune per environment without code changes.
 */
export const RATELIMIT_PRESETS = {
  default: {
    capacity: env.RATE_LIMIT_DEFAULT_CAPACITY,
    refillPerSec: env.RATE_LIMIT_DEFAULT_REFILL_PER_SEC,
  },
  auth: {
    capacity: env.RATE_LIMIT_AUTH_CAPACITY,
    refillPerSec: env.RATE_LIMIT_AUTH_REFILL_PER_SEC,
  },
} as const;

export type RateLimitPresetName = keyof typeof RATELIMIT_PRESETS;
