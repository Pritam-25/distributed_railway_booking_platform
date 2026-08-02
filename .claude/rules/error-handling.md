# Error Handling

The whole system has one error class — `ApiError` from `@irctc/errors`. Anything else is a code smell.

## The error pipeline

```
ApiError (thrown)  →  errorHandler middleware  →  NormalizeError  →  createErrorResponse
                                                       ↓
                                                  ErrorContract (code, message, details)
                                                       ↓
                                            errorResponse (envelope in @irctc/http)
```

Three rules follow from this:

1. Throw `ApiError` with constants, never raw strings.
2. Never `catch` an `ApiError` in a controller or service — let it propagate. Catching is for translating other error systems (Prisma, Zod, kafkajs, nice-grpc) into `ApiError`.
3. Register every user-facing message with the global registry at startup so `createErrorResponse` can render it.

## Throwing `ApiError` correctly

`ApiError` is `(statusCode, code, message?, details?)`. The `code` is the **error key**; the `message` is an optional override.

There are two kinds of error codes, with different message-source rules:

### Service-specific codes (`ERROR_CODES.*` in `src/utils/errors/`)

These carry their message via the service's registry. The throwing
site passes only the code; the message comes from
`ERROR_MESSAGES[code]` at response time.

```ts
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";

throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
```

Override the registry message **only** when a single call-site needs
different copy:

```ts
throw new ApiError(
  statusCode.conflict,
  ERROR_CODES.TRAIN_OPERATING_DAYS_REFERENCED,
  "Cannot remove operating days that have active future schedules.",
);
```

### `COMMON_ERROR_CODES.*` (in `@irctc/errors`)

`COMMON_ERROR_MESSAGES` carries the default messages, but those
defaults are too generic for a user-facing error (`"Resource not
found."`, `"Invalid request input."`). When a throwing site needs a
more specific message than the generic default, it can pass an
override as the third argument to `ApiError`. The override is
**optional** — if the generic default from `COMMON_ERROR_MESSAGES`
fits the failure, omit the third argument — but **recommended**
whenever the user could act on a more specific message.

The source of truth for the override copy is `COMMON_ERROR_MESSAGES`
itself — match its voice ("Invalid request input.", "Resource not
found."), don't invent a new register.

```ts
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";

// Generic default — message comes from COMMON_ERROR_MESSAGES[code].
throw new ApiError(statusCode.notFound, COMMON_ERROR_CODES.NOT_FOUND);
```

```ts
// Override — recommended when the user can act on the specifics.
throw new ApiError(
  statusCode.badRequest,
  COMMON_ERROR_CODES.INVALID_INPUT,
  "scheduleId must be a valid UUID.",
);
```

```ts
throw new ApiError(
  statusCode.notFound,
  COMMON_ERROR_CODES.NOT_FOUND,
  `Seat inventory not found for scheduleId=${scheduleId}, seatId=${seatId}.`,
);
```

Rules for the override when you do pass one:

- **State the failing condition** — name the field, include the
  identifier, or quote the conflicting value. Don't repeat
  `COMMON_ERROR_MESSAGES[code]` verbatim.
- **Match the registry voice** — third-person, period-terminated, no
  exclamation, no leading capital exception.
- **Never include PII** — no email, phone, name, or full payload.
  The throw site is logged; the override ends up in HTTP responses.
- **Prefer a service-specific code over an override** — when a
  common code would need a long, domain-specific message, adding a
  new entry to `ERROR_CODES` + `ERROR_MESSAGES` is preferred over
  abusing `COMMON_ERROR_CODES.NOT_FOUND` with a domain-specific
  message. The rule of thumb: if the override varies by resource,
  it's a code, not a message.

`statusCode` comes from `@irctc/http`, **not** raw `404` / `409`
integers. Error codes come from `COMMON_ERROR_CODES` (in
`@irctc/errors`) or the service's `src/utils/errors/errorCodes.ts`
— **not** raw strings.

## Per-service error registry

Each service has:

```ts
// src/utils/errors/errorCodes.ts
export const ERROR_CODES = {
  STATION_ALREADY_EXISTS: "STATION_ALREADY_EXISTS",
  STATION_NOT_FOUND: "STATION_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
```

```ts
// src/utils/errors/errorMessages.ts
import { ERROR_CODES, type ErrorCode } from "./errorCodes.js";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.STATION_ALREADY_EXISTS]:
    "Station with this code already exists.",
  [ERROR_CODES.STATION_NOT_FOUND]: "Station not found.",
};
```

`src/utils/errors/index.ts` re-exports both. `server.ts` calls `registerErrorMessages(ERROR_MESSAGES)` **before** anything else.

### Conventions

- Add a new code in **both** files at the same time. Forgetting `errorMessages.ts` produces `MISSING_ERROR_MESSAGE` in the response — caught by `check-types` because `Record<ErrorCode, string>` is exhaustive.
- Codes are `SCREAMING_SNAKE_CASE`, value matches the key.
- Messages are user-facing, third-person, no trailing punctuation beyond a period.
- Messages are centralised for **user-facing errors only**. Do **not** use `ERROR_MESSAGES` for developer log lines — write a short specific log message and reference the `ERROR_CODES.*` key in a comment if it corresponds to a user-facing failure code.

## Translating external errors

### Prisma

| Prisma code         | `ApiError`                                                          |
| ------------------- | ------------------------------------------------------------------- |
| `P2002` (unique)    | `statusCode.conflict` + `<RESOURCE>_ALREADY_EXISTS`                 |
| `P2025` (not found) | `statusCode.notFound` + `<RESOURCE>_NOT_FOUND`                      |
| `P2003` (FK)        | `statusCode.badRequest` + `INVALID_INPUT` or a domain-specific code |

Use `normalizePrismaError` from `@irctc/errors` for the common cases; catch in the service when you need a domain-specific code.

### Zod

`validateSchema` / `validateQuery` / `validateParams` from `@irctc/middleware` already produce an `ApiError` with `INVALID_INPUT` (or the appropriate code) on failure. Services should never `parse` user input directly — let the route layer do it. If a service must re-validate, use `safeParse` and convert the result to `ApiError` with `INVALID_INPUT` plus the issue list in `details`.

### kafkajs

`KafkaJSError` is caught by the consumer wrapper / DLQ handler. Do not wrap kafkajs errors in `ApiError` — consumers don't produce HTTP responses.

### nice-grpc (gRPC boundary)

The gRPC server handler side: throw `ApiError` and let `@irctc/grpc`'s `error.middleware` translate via `mapToGrpcError` (which maps to `ServerError` + gRPC `Status`).

The gRPC client side: catch `ClientError` from `nice-grpc` and translate to `ApiError`. The status code mapping is the inverse of `mapApiCodeToGrpcStatus` — see `packages/grpc/src/errors/mapper.ts`.

> **Known drift**: `packages/grpc/src/errors/mapper.ts` references `ERROR_CODES.VALIDATION_ERROR` and `ERROR_CODES.BAD_REQUEST`, which are **not** exported from `@irctc/errors`. Only `COMMON_ERROR_CODES.INVALID_INPUT` exists for the validation case, and there is no `BAD_REQUEST` code. The mapper's status-code fallback branch handles these correctly, but the named-code cases are dead. **Fix in a separate change** by removing the two dead cases; until then, never write new code that depends on `VALIDATION_ERROR` / `BAD_REQUEST` codes.

## What never to do

- `throw new Error("Train not found")` — use `ApiError`.
- Hardcoded status code numbers (`throw new ApiError(404, ...)`) — use `statusCode.notFound`.
- Hardcoded error code strings (`throw new ApiError(404, "TRAIN_NOT_FOUND")`) — use `ERROR_CODES.TRAIN_NOT_FOUND`.
- `try { await service.do(); } catch (e) { res.status(500).json(...) }` in a controller — let `errorHandler` see the error.
- Catch an `ApiError` and rethrow it as another `ApiError` — that hides the original code.
- Log full `ApiError` objects with stack traces in production logs — log the `code` and a short reason.
- Use `process.exit` from inside a service to "recover" from an error — let the global handler do its job.
