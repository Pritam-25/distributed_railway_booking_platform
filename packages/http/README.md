# @irctc/http

Centralized HTTP utilities, context management, and response formatters for the IRCTC-style distributed railway booking platform.

## Features

- **Request Context (`AsyncLocalStorage`):** Scopes request-specific metadata (such as `requestId`) down the call stack using Node's `AsyncLocalStorage`.
- **OpenTelemetry Correlation:** Integrates with `@opentelemetry/api` to resolve the current active span's `traceId` automatically.
- **Standardized Response Envelopes:** Standard success, paginated, and error wrappers that normalize metadata (`requestId`, `traceId`, `timestamp`).
- **HTTP Status Code Mapping:** Immutable mapping constants for standard HTTP status code values.

## Directory Structure

```text
packages/http/
├── src/
│   ├── constants/  # Standard HTTP status code constants
│   ├── context/    # AsyncLocalStorage and OpenTelemetry context accessors
│   ├── response/   # Standardized API response formatters
│   └── index.ts    # Main entry point exports
```

## Usage

### 1. Request Context Scoping

Use `runWithRequestContext` inside Express middleware or routing pipelines to isolate request contexts:

```typescript
import { runWithRequestContext } from "@irctc/http";
import { v4 as uuidv4 } from "uuid";

app.use((req, res, next) => {
  const requestId = (req.headers["x-request-id"] as string) || uuidv4();
  runWithRequestContext({ requestId }, () => {
    next();
  });
});
```

### 2. Standardized Responses

Use the helper formatters to return consistent JSON payloads from controllers:

#### Success Response

```typescript
import { successResponse, statusCode } from "@irctc/http";

res.status(statusCode.success).json(
  successResponse("User retrieved successfully", {
    id: "user-1",
    name: "Alice",
  }),
);
```

Yields payload:

```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": { "id": "user-1", "name": "Alice" },
  "meta": {
    "requestId": "4fa8-...",
    "traceId": "9b1deb...",
    "timestamp": "2026-07-20T02:00:00.000Z"
  }
}
```

#### Paginated Response

```typescript
import { paginatedResponse, statusCode } from "@irctc/http";

res.status(statusCode.success).json(
  paginatedResponse("Bookings list", {
    data: [{ id: "booking-1" }],
    metadata: {
      total: 100,
      page: 1,
      limit: 10,
      totalPages: 10,
    },
  }),
);
```

#### Error Response

Automatically maps and normalizes raw errors (or custom exceptions from `@irctc/errors`) into safe envelopes:

```typescript
import { errorResponse, statusCode } from "@irctc/http";

try {
  throw new Error("Invalid request parameter");
} catch (err) {
  res.status(statusCode.badRequest).json(errorResponse(err));
}
```

## APIs Reference

### Context Helpers

- `getRequestId()`: Retrieves the `requestId` from the active AsyncLocalStorage request store.
- `getTraceId()`: Extracts the W3C trace ID from the active OpenTelemetry span context.

### Status Code Mapping

`statusCode` provides read-only properties for:

- Successful codes (`success: 200`, `created: 201`, `noContent: 204`)
- Client error codes (`badRequest: 400`, `unauthorized: 401`, `forbidden: 403`, `notFound: 404`, `conflict: 409`, `unprocessable: 422`)
- Server error codes (`internalError: 500`, `badGateway: 502`, `serviceUnavailable: 503`)
