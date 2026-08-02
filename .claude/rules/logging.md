# Logging

The logger is Pino, configured in `@irctc/logger` with `REDACT_PATHS` for credentials and secrets (`password`, `token`, `otp`, `cardNumber`, `cvv`, `upiPin`, `*.password`, etc.). It does **not** redact PII. That is our job.

## PII is forbidden in log payloads

Never bind these fields to a log statement in any service:

- `email`
- `firstName`, `lastName`, `fullName`
- `phone`
- `address`, `dateOfBirth`
- Full `req.body`, full `req.user`, full DTOs
- Full Kafka event / request objects
- Anything that could identify a real person

For unauthenticated flows, use `sessionId` instead of `userId`.

## What to use instead

Use stable, non-PII identifiers:

- `eventId` — every event has one. The single most useful correlation key.
- `userId` — when you have it (e.g. the JWT subject).
- `sessionId` — for unauthenticated flows.
- `aggregateId` — entity UUIDs (train, booking, schedule).
- `requestId` — `req.id`, set by `requestIdMiddleware`. Echoed in `X-Request-ID`.

If you need to record that "user X requested a password reset" but don't have a `userId`, log the `eventId` and a domain key (e.g. `requestedFor: "self-service"`). Do not log the email.

## What to log

- Lifecycle: bootstrap, shutdown, worker start/stop, consumer subscribe, gRPC bind/close.
- Failures: `logger.error({ module, err: error }, "short reason")` — `err` is the canonical key for an Error in this codebase.
- Business context: `eventId`, `aggregateId`, `userId`, `retryCount`. **Never** the payload itself.
- Timing: `latencyMs` from readiness checks, hold-expired timestamps, gRPC client call latency.

## What not to log

- `req.body` — use `req.id` and a redacted field summary if you need to correlate.
- Full `req.user` — log `userId` if present.
- Zod issues at length — log `result.error.issues` (the array is fine, the payload it parsed is not).
- Kafka event payloads — log `eventId` and `topic` and `consumerGroup`.
- Outbox row payloads — log `eventId`, `aggregateId`, `eventType`, `topic`, and `retryCount`.
- gRPC request/response bodies — log `method`, `requestId`, and `latencyMs`.
- Stack traces for expected failures (validation errors, 404s) — log `code` and a short reason only.

## The error-code bridge

When a log line corresponds to a user-facing failure code, reference the key in a comment so future readers can find the matching `ApiError` and registry message:

```ts
// ERROR_CODES.SEATS_ALREADY_HELD
logger.warn(
  { module: "seat-allocation", scheduleId, eventId },
  "seat hold conflict",
);
```

This keeps the developer log line free of PII while staying traceable to the API contract.

## REDACT_PATHS is a trust boundary

`packages/logger/src/constants.ts` is the single source of truth for what gets redacted. Any change to it:

- must be reviewed against the full list of services;
- must add the path in glob form (`*.password`, `headers.cookie`, ...);
- must be paired with code changes that ensure those paths are populated by structured log fields (not concatenated into the message string — Pino's `REDACT_PATHS` works on JSON paths only).

If a service needs a new field redacted, add it here, not in the service.

## Logger calls — self-check

Before saving any `logger.*` call, run this checklist:

1. Does the bound object contain `email`, `firstName`, `lastName`, `phone`, `address`, `dateOfBirth`? → Remove it.
2. Is there a full `req.body`, `req.user`, event payload, gRPC request, or DTO? → Replace with `req.id` + a redacted summary.
3. Is the field a known credential / secret? → Make sure it's already covered by `REDACT_PATHS`; if not, add it.
4. Is the log line tied to a user-facing error code? → Add a `// ERROR_CODES.*` comment.

If any check fails, fix the call before saving.
