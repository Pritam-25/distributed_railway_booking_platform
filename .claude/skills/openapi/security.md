# Security — Schemes and Requirements

Reference for the platform's two security schemes and the named
requirement presets. Load this file when designing an endpoint's auth
contract, or when reviewing whether an endpoint's `security` field is
correct.

## The two schemes

The platform has exactly two security schemes, both registered via
`registerGatewayAuth(registry)` from `@irctc/openapi`. Do not introduce a
third scheme unless the platform's auth model genuinely changes.

### `bearerAuth` — Bearer JWT

```yaml
type: http
scheme: bearer
bearerFormat: JWT
description: Enter JWT Access Token
```

Used for programmatic clients: mobile apps, BFFs, service-to-service
calls. The token travels in the `Authorization: Bearer <token>` header.

### `cookieAuth` — HTTP-only `access_token` cookie

```yaml
type: apiKey
in: cookie
name: access_token
description: Access token stored in HTTP-only cookie for browser clients
```

Used for browser clients. The token is set by the gateway's `Set-Cookie`
header and read from subsequent requests' cookies. HTTP-only means
JavaScript cannot read the cookie, which mitigates XSS-based token
exfiltration.

The cookie name is fixed (`access_token`) so multiple services can read
it without per-service configuration.

## The named requirement presets

Three presets are exported from `packages/openapi/src/security/requirements.ts`:

### `GatewayAuthSecurity` — either Bearer or cookie

```ts
export const GatewayAuthSecurity: SecurityRequirementObject =
  SecurityRequirements["gatewayAuth"]!;
```

This is `[ { bearerAuth: [] }, { cookieAuth: [] } ]`. Use this for any
authenticated endpoint. The endpoint accepts both Bearer JWT and the
`access_token` cookie; whichever the client sends, the auth middleware
will resolve to the same identity.

### `SecurityRequirements.bearerAuth` — Bearer only

`[ { bearerAuth: [] } ]`. Use only when the endpoint is specifically
designed for non-browser clients (e.g. a service-to-service admin API
that explicitly does not accept cookies).

In practice, **almost every endpoint in this codebase should use
`GatewayAuthSecurity`**, not the Bearer-only preset. Defaulting to
Bearer-only blocks browser clients from using the endpoint.

### `SecurityRequirements.cookieAuth` — cookie only

`[ { cookieAuth: [] } ]`. Use when the endpoint is specifically
designed for browser flows and rejecting Bearer auth is the desired
behavior. This is uncommon in the current codebase but may apply to
endpoints that depend on CSRF protection tied to cookie behavior.

## When to declare `security: []`

Public, unauthenticated endpoints must declare `security: []` to make it
explicit that no auth is required. Examples:

- `POST /api/v1/auth/send-otp` — registration entry point.
- `POST /api/v1/auth/login` — login entry point.
- `POST /api/v1/admin/auth/login` — admin login entry point.

**Never omit the `security` field.** OpenAPI's default is ambiguous in
the merged gateway spec, and tools that consume the spec rely on the
explicit declaration to render auth UI correctly.

## Endpoint security matrix

| Endpoint type                             | `security` field                  |
| :---------------------------------------- | :-------------------------------- |
| Authenticated user endpoint               | `GatewayAuthSecurity`             |
| Authenticated admin endpoint              | `GatewayAuthSecurity`             |
| Service-to-service endpoint (non-browser) | `SecurityRequirements.bearerAuth` |
| Public unauthenticated endpoint           | `[]`                              |

If you're not sure which applies, default to `GatewayAuthSecurity` —
that covers the most common case (any authenticated endpoint that may be
called by either a browser or a programmatic client).

## Common mistakes

### Omitting `security`

```ts
// ❌ Default is ambiguous in the merged spec.
registry.registerPath({
  method: "post",
  path: "/api/v1/users/me",
  // no security field
  responses: { ... },
});
```

Some tools will assume the endpoint is unauthenticated; others will
inherit from a parent definition (which OpenAPI doesn't actually have).
Always be explicit.

### Wrong scheme for an authenticated endpoint

```ts
// ❌ Should be GatewayAuthSecurity, not bearerAuth-only.
security: [{ bearerAuth: [] }],
```

Browser clients that rely on the `access_token` cookie will fail this
endpoint. The frontend SDK's request layer doesn't send a Bearer header
by default — it relies on the cookie being attached automatically.

### `security: []` on an authenticated endpoint

```ts
// ❌ Public security on an endpoint that actually requires auth.
registry.registerPath({
  method: "get",
  path: "/api/v1/users/me",
  security: [],
  // ...
});
```

This tells consumers the endpoint is public. They will not send auth
credentials, and the auth middleware at runtime will reject the request.
The spec lies about the endpoint's real contract.

## The `registerGatewayAuth` helper

```ts
import { registerGatewayAuth } from "@irctc/openapi";

registerGatewayAuth(registry);
```

This registers both `bearerAuth` and `cookieAuth` as named schemes in
`components.securitySchemes`. Every service registry calls this once at
module load, near the top, before any `registry.registerPath(...)` calls.

If you see a service registry without `registerGatewayAuth(registry)`,
the spec is missing the security scheme definitions, and consumers won't
be able to resolve the auth credentials in their UIs.
