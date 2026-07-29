/**
 * Bearer JWT security scheme.
 *
 * The gateway issues short-lived JWTs for both user and admin sessions. Bearer
 * auth is preferred for programmatic clients (mobile, BFF, service-to-service)
 * because the token travels in the Authorization header.
 */
export const bearerAuthScheme = {
  type: "http" as const,
  scheme: "bearer" as const,
  bearerFormat: "JWT",
  description: "Enter JWT Access Token",
};

/**
 * HTTP-only `access_token` cookie security scheme.
 *
 * Used by browser clients where setting the cookie via the gateway's Set-Cookie
 * header avoids JS access to the token. The cookie name is fixed so multiple
 * services can read it without per-service configuration.
 */
export const cookieAuthScheme = {
  type: "apiKey" as const,
  in: "cookie" as const,
  name: "access_token",
  description: "Access token stored in HTTP-only cookie for browser clients",
};
