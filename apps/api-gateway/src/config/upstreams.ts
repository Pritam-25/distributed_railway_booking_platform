import { env } from "./env.js";

export type Upstream = {
  name: string;
  baseUrl: string;
  circuitName: string;
};

/**
 * Registry of every service the gateway can proxy to.
 *
 * Each entry has:
 * - `name`        — short identifier (used for logs and the HPM cache key)
 * - `baseUrl`     — full upstream URL (used for HPM proxying)
 * - `circuitName` — stable name for the circuit breaker; MUST match a
 *                   key in `resilience/timeouts.ts`
 *
 * Keep this list in lockstep with the services that exist in
 * `apps/` — adding a non-existent URL here causes boot-time failure.
 */
export const upstreams = {
  user: {
    name: "user",
    baseUrl: env.USER_UPSTREAM,
    circuitName: "user-service",
  },
  admin: {
    name: "admin",
    baseUrl: env.ADMIN_UPSTREAM,
    circuitName: "admin-service",
  },
} satisfies Record<string, Upstream>;
