# Manual Testing Guide — `api-gateway`

A Postman-driven checklist that exercises every code path in
`src/proxy/proxyMiddleware.ts` and the surrounding middleware
(rate limit, auth, circuit breaker, path rewrite).

Use this after any change to the proxy, the route table, the rate-limit
presets, or the circuit-breaker defaults.

## Setup

### 1. Start the stack

```bash
# Terminal 1 — the gateway itself
cd D:\dev\distributed_railway_booking_platform
pnpm --filter api-gateway dev

# Terminal 2 — at least one upstream (so test 1/2/4 have something to call)
pnpm --filter user-service dev
```

### 2. Confirm both are up

```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
```

### 3. Postman environment variables

| Variable    | Value                   | Notes                                    |
| :---------- | :---------------------- | :--------------------------------------- |
| `gateway`   | `http://localhost:4000` | Edge base URL                            |
| `userToken` | _(see step 4)_          | Bearer token for `auth: required` routes |
| `phone`     | `+919876543210`         | Used by the `auth/send-otp` smoke test   |

### 4. (Optional) Get a real user token

Skip if your service has a dev login shortcut. Otherwise run the
public auth flow once and paste the resulting `accessToken` into the
`userToken` variable:

```bash
curl -X POST http://localhost:4000/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210"}'
# → OTP goes to your dev inbox / console
curl -X POST http://localhost:4000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210","otp":"123456"}'
# → { "data": { "accessToken": "eyJ..." } }
```

### 5. Filter gateway logs in real time

Open a third terminal and tail only the lines you care about — the
request/middleware lines, the proxy lines, and the circuit-breaker
state changes:

```bash
pnpm --filter api-gateway dev 2>&1 | grep -E "request|proxy|circuit-breaker"
```

A pre-request script in Postman that prints the outgoing request
makes log correlation easier:

```js
console.log(`→ ${pm.request.method} ${pm.request.url}`);
```

---

## Test matrix

The "Proxy invoked?" column is the most useful sanity check: if you
see a proxy log line on a test marked **No**, middleware ordering is
broken in `app.ts` or `routing/mountRoutes.ts` and the proxy is
running before the auth/rate-limit gate.

| #   | Test                | Trigger                                     | Expected status | Expected code / message                                            | Proxy invoked?           |
| :-- | :------------------ | :------------------------------------------ | :-------------- | :----------------------------------------------------------------- | :----------------------- |
| 1   | Happy path          | Valid JWT, upstream up                      | `200`           | upstream payload                                                   | Yes                      |
| 2   | Public route        | `auth: none` (e.g. `auth/send-otp`)         | `200`           | upstream payload, `userId=anonymous` in log                        | Yes                      |
| 3   | Auth missing        | No `Authorization` header                   | `401`           | `ACCESS_TOKEN_MISSING`                                             | **No**                   |
| 4   | Auth invalid        | Bogus `Bearer` token                        | `401`           | `ACCESS_TOKEN_INVALID`                                             | **No**                   |
| 5   | Rate limit hit      | >10 calls in <60s on an `auth` preset route | `429`           | `RATE_LIMIT_EXCEEDED`; `Retry-After`, `X-RateLimit-*` headers      | **No**                   |
| 6   | Method not allowed  | HTTP method outside `route.methods`         | `405`           | `METHOD_NOT_ALLOWED`                                               | **No**                   |
| 7   | Upstream 4xx        | `GET` a non-existent user id                | `404`           | upstream's payload (passed through), proxy logs `INFO` (not error) | Yes                      |
| 8   | Upstream 5xx        | Trigger a 5xx in `user-service`             | `500` (or 5xx)  | upstream's payload, proxy logs `ERROR`                             | Yes                      |
| 9   | Upstream down (1–4) | Stop `user-service`, send 4 requests        | `502`           | `GATEWAY_UPSTREAM_ERROR` "Upstream service is unavailable"         | Yes                      |
| 10  | Circuit opens (5th) | 5th request while upstream is down          | `502` + warn    | proxy `ERROR`, then `[WARN] circuit-breaker  from=CLOSED to=OPEN`  | Yes (final)              |
| 11  | Circuit open (6th+) | 6th and later requests                      | `503`           | `GATEWAY_UPSTREAM_CIRCUIT_OPEN` "circuit breaker ... is OPEN"      | **No** (short-circuited) |
| 12  | Upstream timeout    | Force slow upstream, low timeout config     | `504`           | `GATEWAY_UPSTREAM_ERROR` "Upstream request timed out"              | Yes                      |
| 13  | Unknown route       | `GET /api/v1/no-such-thing`                 | `404`           | `notFoundHandler` body (no proxy line)                             | **No**                   |
| 14  | Path rewrite        | `GET /api/v1/users/me`                      | `200`           | `user-service` logs `GET /users/me` (prefix stripped)              | Yes                      |

---

## Test details

### 1. Happy path

```
GET {{gateway}}/api/v1/users/me
Authorization: Bearer {{userToken}}
```

- **Status:** `200`
- **Logs:**
  ```
  [INFO] request   GET /api/v1/users/me  200  XXms  requestId=req_xxx userId=usr_xxx
  [INFO] proxy     upstream=user-service status=200 duration=XXms circuit=CLOSED requestId=req_xxx userId=usr_xxx
  ```

### 2. Public route

```
POST {{gateway}}/api/v1/auth/send-otp
Content-Type: application/json

{ "phone": "{{phone}}" }
```

- **Status:** `200` / `202`
- `userId` in the proxy log line reads `anonymous` (proves `auth: "none"` ran without setting `req.user`).
- `circuitName` in the log is `user-service`.

### 3. Auth missing → 401

```
GET {{gateway}}/api/v1/users/me
```

- **Status:** `401`
- **Body:** `{"success": false, "code": "ACCESS_TOKEN_MISSING", "message": "Access token is missing"}`
- The proxy log line must be **absent** — the auth middleware short-circuits before the proxy.

### 4. Auth invalid → 401

```
GET {{gateway}}/api/v1/users/me
Authorization: Bearer not-a-real-token
```

- **Status:** `401`
- **Body:** `{"success": false, "code": "ACCESS_TOKEN_INVALID", ...}`
- Same as test 3 — no proxy log line.

### 5. Rate limit hit → 429

Send the same request 11 times in quick succession (the `auth` preset
has a 10-token bucket):

```
POST {{gateway}}/api/v1/auth/send-otp   × 11
```

- First ~10 calls: `200` / `202`
- 11th call onwards: `429`
- **Response headers:** `X-RateLimit-Limit: 10`, `X-RateLimit-Remaining: 0`, `Retry-After: 6` (or so)
- **Body:** `{"success": false, "code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests..."}`
- **Log:** `[WARN] request  POST /api/v1/auth/send-otp  429  ...` (no proxy line)
- The bucket refills at 0.1667 tokens/sec (10 per 60s), so wait ~60s and the 11th call goes through again.

### 6. Method not allowed → 405

Pick a route with a `methods` allowlist. If none of your current
routes restrict methods, temporarily add one to
`src/config/routes.ts`:

```ts
{
  prefix: "/api/v1/auth/sessions",
  upstream: upstreams.user,
  auth: "required",
  rateLimit: "default",
  methods: ["POST", "DELETE"],  // ← temporary
},
```

```
GET {{gateway}}/api/v1/auth/sessions   // not in allowlist
Authorization: Bearer {{userToken}}
```

- **Status:** `405`
- **Body:** `{"success": false, "code": "METHOD_NOT_ALLOWED", "message": "Method GET not allowed for /api/v1/auth/sessions"}`
- **Revert** the `methods` array after the test — most routes are intentionally open.

### 7. Upstream 4xx

```
GET {{gateway}}/api/v1/users/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{userToken}}
```

- **Status:** `404` (whatever `user-service` returns)
- The status is **passed through** unchanged.
- **Log:** proxy `INFO succeeded` (4xx is not a failure of the proxy itself, even if the upstream says so).

### 8. Upstream 5xx

Easiest way: temporarily throw in a `user-service` handler, e.g.

```ts
// apps/user-service/src/controllers/some.controller.ts
async getMe(_req, _res) {
  throw new Error("intentional test failure");
}
```

```
GET {{gateway}}/api/v1/users/me
Authorization: Bearer {{userToken}}
```

- **Status:** `500` (whatever `user-service` returns)
- **Log:**
  ```
  [ERROR] proxy   upstream=user-service status=500 duration=XXms circuit=CLOSED requestId=req_xxx
  ```
- Note the status code is from the upstream — the proxy does **not** rewrite it. This is the only 5xx path that does **not** increment the circuit-breaker failure count (the proxy already returned the response, the call "succeeded" from the breaker's POV).

### 9–11. Upstream down + circuit breaker progression

1. Note current circuit state in the log (should be `CLOSED`).
2. Stop `user-service` (`Ctrl+C` in its terminal).
3. With a valid JWT, send 6 identical requests:

```
GET {{gateway}}/api/v1/users/me
Authorization: Bearer {{userToken}}
```

| Request | Status | Code                            | Circuit state                               |
| :------ | :----- | :------------------------------ | :------------------------------------------ |
| 1       | `502`  | `GATEWAY_UPSTREAM_ERROR`        | `CLOSED` (1/5)                              |
| 2       | `502`  | `GATEWAY_UPSTREAM_ERROR`        | `CLOSED` (2/5)                              |
| 3       | `502`  | `GATEWAY_UPSTREAM_ERROR`        | `CLOSED` (3/5)                              |
| 4       | `502`  | `GATEWAY_UPSTREAM_ERROR`        | `CLOSED` (4/5)                              |
| 5       | `502`  | `GATEWAY_UPSTREAM_ERROR`        | **CLOSED → OPEN**                           |
| 6       | `503`  | `GATEWAY_UPSTREAM_CIRCUIT_OPEN` | `OPEN` (short-circuited — no upstream call) |

Around request 5 you should also see a state-transition log line:

```
[WARN] circuit-breaker  circuit="user-service" from=CLOSED to=OPEN
  Circuit "user-service" transitioned from CLOSED → OPEN
```

**Recovery check (optional):**

1. Restart `user-service`.
2. Wait `recoveryTimeout` = **30s** (configured in `resilience/breakerRegistry.ts`).
3. Send a request. The breaker transitions to `HALF_OPEN` and lets one trial through.
4. Send 2 more successful requests — the breaker transitions back to `CLOSED` after 3 successes:
   ```
   [WARN] circuit-breaker  circuit="user-service" from=HALF_OPEN to=CLOSED
   ```

### 12. Upstream timeout → 504

Two-step setup. First, force a low timeout for the user-service
breaker:

```ts
// apps/api-gateway/src/resilience/timeouts.ts
export const TIMEOUTS: Record<string, number> = {
  "user-service": 100, // ← was whatever the default was
  // ...
};
```

Then make a `user-service` handler sleep past that:

```ts
// temporary — in any user-service controller method
await new Promise((r) => setTimeout(r, 1000));
```

```
GET {{gateway}}/api/v1/users/me
Authorization: Bearer {{userToken}}
```

- **Status:** `504`
- **Body:** `{"success": false, "code": "GATEWAY_UPSTREAM_ERROR", "message": "Upstream request timed out"}`
- **Log:** `[ERROR] proxy  upstream=user-service err=CircuitBreakerTimeoutError duration=100ms circuit=CLOSED requestId=req_xxx`
- The thrown error is `CircuitBreakerTimeoutError` from `@irctc/resilience` — the proxy narrows with `instanceof`, so the code path is type-safe (typos would be compile errors).
- **Revert** the timeout config and the artificial delay after testing.

### 13. Unknown route → 404

```
GET {{gateway}}/api/v1/this-does-not-exist
```

- **Status:** `404`
- **Body:** whatever `notFoundHandler` produces (gateway's standard envelope).
- No proxy log line — no route matched, so no upstream was selected.

### 14. Path rewrite sanity check

The gateway strips `/api/v1` before forwarding:

```
GET {{gateway}}/api/v1/users/me
Authorization: Bearer {{userToken}}
```

- In `user-service`'s terminal, the incoming request should log as `GET /users/me`, **not** `GET /api/v1/users/me`.
- This is `pathRewrite` in `src/proxy/proxyMiddleware.ts:32`.

---

## Failure signature cheatsheet

If a test fails, this table tells you which layer is broken.

| Symptom                                               | Likely cause                                                          |
| :---------------------------------------------------- | :-------------------------------------------------------------------- |
| Proxy log on test 3/4/5/6/13                          | Middleware order in `app.ts` or `routing/mountRoutes.ts` is wrong     |
| Test 9 always 503, never 502                          | Circuit is already OPEN from a prior run; wait `recoveryTimeout`      |
| Test 9 returns 502 but breaker never opens            | `failureThreshold` raised; check `breakerRegistry.ts` defaults        |
| Test 12 returns 502 not 504                           | Either upstream isn't slow enough, or `TIMEOUTS[circuitName]` not set |
| Test 14 shows `/api/v1/users/me` arriving at upstream | `pathRewrite` regex in `proxyMiddleware.ts:32` was changed            |
| 5xx returned by upstream logs as `INFO` in proxy      | Correct — 5xx is an upstream concern, not a proxy failure             |
| No log line at all (not even `request`)               | `requestLoggerMiddleware` not wired; check `app.ts:64`                |

---

## Cleanup checklist

After running the destructive tests (8, 9–11, 12), confirm you reverted:

- [ ] `methods: ["POST", "DELETE"]` in `src/config/routes.ts` (test 6)
- [ ] `throw new Error("intentional...")` in any controller (test 8)
- [ ] `await new Promise(...)` artificial delay (test 12)
- [ ] `TIMEOUTS["user-service"] = 100` (test 12)
- [ ] `user-service` is back running if you want to test other things
- [ ] Rate-limit bucket has refilled (or wait 60s) before re-running test 5
