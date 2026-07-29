import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { bearerAuthScheme, cookieAuthScheme } from "./schemes.js";

/**
 * Register the Bearer JWT security scheme under `bearerAuth`.
 */
export const registerBearerAuth = (registry: OpenAPIRegistry) => {
  registry.registerComponent("securitySchemes", "bearerAuth", bearerAuthScheme);
};

/**
 * Register the access_token cookie security scheme under `cookieAuth`.
 */
export const registerCookieAuth = (registry: OpenAPIRegistry) => {
  registry.registerComponent("securitySchemes", "cookieAuth", cookieAuthScheme);
};

/**
 * Register both Bearer JWT and cookie auth schemes — the standard set used by
 * services routed through the API Gateway.
 *
 * Either scheme alone authenticates a request; the gateway's auth middleware
 * accepts the first valid credential it finds.
 */
export const registerGatewayAuth = (registry: OpenAPIRegistry) => {
  registerBearerAuth(registry);
  registerCookieAuth(registry);
};
