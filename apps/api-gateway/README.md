# `api-gateway`

> API gateway and routing edge for the IRCTC platform.
> Handles edge security (CORS, Helmet), request validation, cookie parsing,
> client identity validation & header injection, rate limiting, and service resilience via circuit breakers.

## Responsibilities

**Owns:**

- Centralized ingress request routing and forwarding to downstream microservices (e.g. `user-service`).
- Edge security header management (Helmet) and CORS policy enforcement.
- Cookie parsing for access/refresh/admin tokens.
- Route authentication level enforcement (`none`, `required`, `optional`, `admin`).
- Prevention of client identity header forgery by scrubbing downstream-trusted headers (`x-user-id`, `x-user-email`, `x-session-id`, `x-admin-id`) on ingress.
- Injecting verified client JWT claims as trusted request headers for downstream consumption.
- Edge rate limiting with Redis-backed token buckets (presets: `default`, `auth`).
- Upstream resilience via circuit breakers per downstream connection using `@irctc/resilience`.
- Standardized Gateway error responses (e.g., `502 Bad Gateway`, `429 Too Many Requests`, `503 Service Unavailable`).

**Does NOT own:**

- User database tables, password hashing, and user credential validation (owned by `user-service`).
- Email template composition or message sending (owned by `notification-service`).
- Business logic validation (e.g., ticket availability checks or booking rules).

## Endpoints

All public-facing API routes flow through the gateway. Responses follow the `@irctc/http` envelope structure.

### Routes Registry

| Prefix                    | Upstream Target | Auth Level | Rate Limit Preset | Notes                                  |
| :------------------------ | :-------------- | :--------- | :---------------- | :------------------------------------- |
| `/api/v1/auth/sessions`   | `user-service`  | `required` | `default`         | Lists or revokes user sessions         |
| `/api/v1/auth/logout-all` | `user-service`  | `required` | `default`         | Revokes all user sessions              |
| `/api/v1/auth/logout`     | `user-service`  | `required` | `default`         | Revokes the current session            |
| `/api/v1/auth`            | `user-service`  | `none`     | `auth`            | Registration, login, password recovery |
| `/api/v1/users`           | `user-service`  | `required` | `default`         | Fetches or updates user info           |

### Health Probes

Mounted directly at root before any middleware logic, allowing Kubernetes and load balancers to query the health status.

| Method | Path            | Description                                                            |
| :----- | :-------------- | :--------------------------------------------------------------------- |
| `GET`  | `/health/live`  | Liveness check. Always returns `200 OK` when the gateway is running.   |
| `GET`  | `/health/ready` | Readiness check. Returns `200 OK` only when Redis connection is alive. |

---

## Architecture at a Glance

```mermaid
flowchart TD
  Client[Client] -- HTTP Request --> GW[api-gateway]

  subgraph Pipeline ["api-gateway Request Pipeline"]
    H[Helmet / CORS] --> C[Cookie Parser]
    C --> RL[Route Matcher]
    RL --> S[Header Scrubbing]
    S --> A[Auth Middleware]
    A --> L[Rate Limiter (Redis)]
    L --> P[Proxy Handler & Circuit Breaker]
  end

  GW --> Pipeline
  P -- Proxy HTTP --> US[user-service]
  L -- Token Invalidation / Bucket --> Redis[(Redis)]
```

---

## Request Processing Pipeline

### 1. Security & Edge Middleware

Every request entering the gateway passes through standard security filters:

- **Helmet**: Secures the app by setting various HTTP headers.
- **CORS**: Enforces origin checks (controlled via the `CORS_ORIGINS` env configuration).
- **Cookie Parser**: Extracts cookie payloads so auth mechanisms can check both the `Authorization` header and request cookies.

### 2. Route Matching

The router performs a longest-prefix match against configured routes in `src/config/routes.ts`.

### 3. Header Scrubbing

Before performing authentication checks, any client-supplied headers matching downstreams' trusted axes are deleted:

- `x-user-id`
- `x-user-email`
- `x-session-id`
- `x-admin-id`

This prevents a malicious client from forging identity headers to access downstream resources.

### 4. Authentication Levels

Based on the matched route, one of four authentication behaviors executes:

- **`none`**: Public route. The client's headers are scrubbed, and the request is passed through.
- **`required`**: Validates the JWT access token from the `Authorization` header (`Bearer <token>`) or `access_token` cookie. Injects `x-user-id`, `x-user-email`, and `x-session-id`. Throws `401 Unauthorized` if invalid/missing.
- **`optional`**: Attempts to validate the access token. If valid, injects the user headers. If invalid or missing, allows the request to continue as anonymous (no headers injected).
- **`admin`**: Validates the JWT admin token from the `admin_access_token` cookie. Injects `x-admin-id`. Throws `401 Unauthorized` if invalid/missing.

### 5. Rate Limiting

Applies token bucket rate limiting via `@irctc/redis`. Keyed by `userId` (for authenticated requests) or client `IP` (for anonymous requests).

- **`default`**: General endpoint preset (e.g. 100 capacity, refilling at ~1.67 tokens/sec).
- **`auth`**: Credential-bearing endpoints (e.g. 10 capacity, refilling at ~0.17 tokens/sec).

### 6. Resilience & Circuit Breaking

The gateway uses `@irctc/resilience` to isolate downstream failures:

- Every upstream is wrapped in a dedicated circuit breaker.
- If the downstream times out or fails repeatedly, the circuit opens, returning `503 Service Unavailable` on subsequent requests.
- If a connection fails to establish, a `502 Bad Gateway` is returned.

---

## Configuration

The gateway is configured via environment variables. Schema validation is enforced at boot time using Zod (`src/config/env.ts`).

| Variable                            | Description                                               | Default                 |
| :---------------------------------- | :-------------------------------------------------------- | :---------------------- |
| `PORT`                              | Port the gateway server listens on                        | `4000`                  |
| `NODE_ENV`                          | Running environment (`development`, `production`, `test`) | `development`           |
| `REDIS_URL`                         | Redis instance URL                                        | _Required_              |
| `CORS_ORIGINS`                      | Comma-separated allowed CORS origins                      | `http://localhost:3000` |
| `USER_UPSTREAM`                     | URL of the user-service                                   | `http://localhost:4001` |
| `NOTIFICATION_UPSTREAM`             | URL of the notification-service                           | `http://localhost:4002` |
| `JWT_SECRET`                        | Secret key used to sign and verify user JWTs              | _Required_              |
| `RATE_LIMIT_DEFAULT_CAPACITY`       | Max tokens for default rate limit bucket                  | `100`                   |
| `RATE_LIMIT_DEFAULT_REFILL_PER_SEC` | Token refill rate per second (default)                    | `1.6667`                |
| `RATE_LIMIT_AUTH_CAPACITY`          | Max tokens for auth rate limit bucket                     | `10`                    |
| `RATE_LIMIT_AUTH_REFILL_PER_SEC`    | Token refill rate per second (auth)                       | `0.1667`                |
| `TRUST_PROXY`                       | Express `trust proxy` setting (`true` / `false`)          | `false`                 |

---

## Development & Operations

### Build and Run Scripts

```bash
# Start development server with tsx watch and telemetry auto-import
pnpm dev

# Type check codebase
pnpm check-types

# Build production distribution files (TS compilation + alias mapping)
pnpm build

# Lint files using ESLint
pnpm lint
pnpm lint:fix
```

### Docker

```bash
# Build the Docker image (must run from the monorepo root)
pnpm docker:build

# Run the container locally using a .env file
pnpm docker:run
```

### Manual testing

For a Postman-driven walkthrough of every code path in the proxy
(success, auth failure, rate limit, 5xx passthrough, circuit
breaker progression, timeout, path rewrite, 405), see
[`MANUAL_TESTING.md`](./MANUAL_TESTING.md). Run that checklist
after any change to the proxy, route table, rate-limit presets, or
circuit-breaker defaults.
