import type { Upstream } from "./upstreams.js";
import { upstreams } from "./upstreams.js";
import type { RateLimitPresetName } from "@ratelimit";

/**
 * Auth level for a route.
 *
 * - `none`     — no auth middleware runs (route is public)
 * - `required` — throws 401 if no valid JWT
 * - `optional` — never throws; sets `req.user` if a valid token is
 *                present, otherwise lets the request through unchanged
 * - `admin`    — throws 401 if no valid admin JWT
 */
export type AuthLevel = "none" | "required" | "optional" | "admin";

/**
 * Configuration for a single gateway route.
 *
 * Routes are matched by longest-prefix against the incoming URL path.
 * The matched route determines which upstream receives the proxied
 * request, what auth runs, and which rate-limit preset applies.
 */
export interface RouteConfig {
  /** URL prefix to match (e.g. "/api/v1/auth"). */
  prefix: string;

  /** Target upstream from the upstreams registry. */
  upstream: Upstream;

  /** Auth requirement for this prefix. */
  auth: AuthLevel;

  /**
   * Per-route rate-limit preset.
   * `auth` is tighter than `default` — use it for credential-bearing
   * endpoints (login, refresh, send-otp).
   */
  rateLimit: RateLimitPresetName;

  /**
   * Optional allowlist of HTTP methods. If omitted, all methods are
   * allowed. When the request method is not in this list, the
   * gateway returns 405 before invoking the proxy.
   */
  methods?: readonly string[];
}

/**
 * Central route table for the API gateway.
 *
 * Order matters: the route matcher returns the FIRST prefix that
 * matches, so the most-specific prefixes MUST come first. The
 * matcher treats `/api/v1/auth/sessions` and `/api/v1/auth` as
 * different — the former wins because it is listed first.
 */
export const routes: readonly RouteConfig[] = [
  /**
   * User service routes
   */
  {
    prefix: "/api/v1/auth/sessions",
    upstream: upstreams.user,
    auth: "required",
    rateLimit: "default",
  },
  {
    prefix: "/api/v1/auth/logout-all",
    upstream: upstreams.user,
    auth: "required",
    rateLimit: "default",
  },
  {
    prefix: "/api/v1/auth/logout",
    upstream: upstreams.user,
    auth: "required",
    rateLimit: "default",
  },
  {
    prefix: "/api/v1/auth",
    upstream: upstreams.user,
    auth: "none",
    rateLimit: "auth",
  },
  {
    prefix: "/api/v1/users",
    upstream: upstreams.user,
    auth: "required",
    rateLimit: "default",
  },
  {
    prefix: "/api/v1/admin/auth/login",
    upstream: upstreams.admin,
    auth: "none",
    rateLimit: "auth",
  },
  {
    prefix: "/api/v1/admin",
    upstream: upstreams.admin,
    auth: "admin",
    rateLimit: "default",
  },
];
