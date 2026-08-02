# Drift — gRPC error mapper and inventory handler

## What's wrong

`packages/grpc/src/errors/mapper.ts` and
`apps/inventory-service/src/grpc/inventory.handler.ts` both reference
error codes that are **not exported** from `@irctc/errors`.

Specifically:

- `ERROR_CODES.VALIDATION_ERROR` — not in `COMMON_ERROR_CODES`.
  Closest is `COMMON_ERROR_CODES.INVALID_INPUT`.
- `ERROR_CODES.BAD_REQUEST` — not in `COMMON_ERROR_CODES`. There is
  no generic "bad request" code in the platform's registry; the
  convention is to use `INVALID_INPUT` (with a domain-specific
  message) or a domain code.

### Impact

`packages/grpc/src/errors/mapper.ts` references these in the
`mapApiCodeToGrpcStatus` switch:

```ts
case ERROR_CODES.VALIDATION_ERROR:
case ERROR_CODES.INVALID_INPUT:
case ERROR_CODES.BAD_REQUEST:
  return Status.INVALID_ARGUMENT;
```

Because `ERROR_CODES.VALIDATION_ERROR` and `ERROR_CODES.BAD_REQUEST`
resolve to `undefined` at runtime, the `case` labels are
`case undefined`. JavaScript silently skips `case undefined`
branches, so the named-code path is dead. The function falls
through to the `default` branch's status-code fallback (`if
(statusCode === 400 ...) return Status.INVALID_ARGUMENT`), so
the wire result is **correct** — but the switch is misleading.

`apps/inventory-service/src/grpc/inventory.handler.ts` uses
`ERROR_CODES.BAD_REQUEST` at a real call site. The error code in the
resulting `ApiError` is the dead string `"BAD_REQUEST"`. The wire
mapping still works (`Status.INVALID_ARGUMENT`), but the `code`
field of any error response from this endpoint is `"BAD_REQUEST"`
instead of the platform-standard `"INVALID_INPUT"`.

## Planned fix (separate change)

In `packages/grpc/src/errors/mapper.ts`:

```diff
-    case ERROR_CODES.VALIDATION_ERROR:
     case ERROR_CODES.INVALID_INPUT:
-    case ERROR_CODES.BAD_REQUEST:
       return Status.INVALID_ARGUMENT;
```

In `apps/inventory-service/src/grpc/inventory.handler.ts`:

```diff
       throw new ApiError(
         statusCode.badRequest,
-        ERROR_CODES.BAD_REQUEST,
+        ERROR_CODES.INVALID_INPUT,
         "Both scheduleId and seatId are required.",
       );
```

Then re-run the inventory handler's tests and the gRPC end-to-end
smoke test (publish a `GetSeatDetailsRequest` with an empty ID,
confirm the response's `code` is `"INVALID_INPUT"`).

## Until the fix lands

- **Never write new code that depends on `ERROR_CODES.VALIDATION_ERROR`
  or `ERROR_CODES.BAD_REQUEST`.** They look exported but resolve to
  `undefined`.
- When writing a new gRPC handler, use `ERROR_CODES.INVALID_INPUT`
  for input validation and a domain-specific code from the service's
  `src/utils/errors/errorCodes.ts` for everything else.
- When writing a new gRPC client-side translator, only use the codes
  exported from `COMMON_ERROR_CODES`.

## Why this isn't fixed as part of the skill

The skill is documentation. Fixing the dead code is a one-line change
in two files, but it needs:

- A review of every other place in the codebase that may import these
  dead codes (ripgrep `ERROR_CODES.BAD_REQUEST` / `ERROR_CODES.VALIDATION_ERROR`).
- A regression test for the inventory handler's error code.
- A coordinated bump of any client that branches on the response
  `code` field.

Those are code-review concerns, not skill-writing concerns.
