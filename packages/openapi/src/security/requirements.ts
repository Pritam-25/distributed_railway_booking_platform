import type { RouteConfig } from "@asteasolutions/zod-to-openapi";

/**
 * Type alias for the `security` field on a registered path operation.
 *
 * Equivalent to `NonNullable<RouteConfig["security"]>`. Re-exported here so
 * downstream consumers can name the type without importing the underlying
 * `@asteasolutions/zod-to-openapi` package directly.
 */
export type SecurityRequirementObject = NonNullable<RouteConfig["security"]>;

/**
 * Named security requirement presets for `registerPath({ security })`.
 *
 * Use the array directly: `security: SecurityRequirements.bearerAuth`. The
 * "gatewayAuth" entry advertises either scheme as acceptable so OpenAPI
 * consumers see the correct list of supported auth methods per operation.
 */
export const SecurityRequirements: Record<string, SecurityRequirementObject> = {
  bearerAuth: [{ bearerAuth: [] }],
  cookieAuth: [{ cookieAuth: [] }],
  gatewayAuth: [{ bearerAuth: [] }, { cookieAuth: [] }],
};

/**
 * Convenience export for the common "either Bearer or cookie" requirement set.
 *
 * Equivalent to `SecurityRequirements["gatewayAuth"]` but typed as a single
 * value rather than a `Record` lookup — the call site reads cleaner.
 */
export const GatewayAuthSecurity: SecurityRequirementObject =
  SecurityRequirements["gatewayAuth"]!;
