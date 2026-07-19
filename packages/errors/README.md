# @irctc/errors

Centralized domain error classes, message registries, and error normalization helpers for the IRCTC-style distributed railway booking platform.

## Features

- **`ApiError` Domain Class:** Custom exception type that wraps an HTTP status code, domain error code, message, and diagnostic metadata details.
- **Normalization Helpers:** Safely translates raw JS/TS exceptions, database driver errors (e.g. Prisma codes), and custom API exceptions into a unified `NormalizedError` structure.
- **Dynamic Message Registry:** Global key-value registry allowing individual microservices to register and translate service-specific error codes dynamically.
- **Standardized Response Shapes:** Pre-defined interfaces and response wrappers matching the API contract specification.

## Directory Structure

```text
packages/errors/
├── src/
│   ├── apiError.ts              # Custom domain ApiError class
│   ├── errorCodes.ts            # Centralized ErrorCode keys
│   ├── errorMessages.ts          # Centralized default error messages
│   ├── errorContract.ts         # Response payload structure types
│   ├── normalizeError.ts        # Primary normalization dispatcher
│   ├── normalizePrismaError.ts  # Database code normalizer
│   ├── createErrorResponse.ts   # Formatter wrapper
│   ├── registry.ts              # Dynamic message registry
│   └── index.ts                 # Main entry point exports
```

## Usage

### 1. Registering Microservice-Specific Custom Errors

Register service-specific error messages during application bootstrap:

```typescript
import { registerErrorMessages } from "@irctc/errors";

registerErrorMessages({
  TRAIN_ALREADY_EXISTS: "The train with this number is already scheduled.",
  NO_SEATS_AVAILABLE: "All seats have been booked for this class.",
});
```

### 2. Throwing a Domain Error

```typescript
import { ApiError, ERROR_CODES } from "@irctc/errors";

// Throwing a standard error
throw new ApiError(
  statusCode.badRequest,
  ERROR_CODES.NOT_FOUND,
  "Station not found",
);

// Throwing a registered service-specific error
throw new ApiError(statusCode.conflict, "TRAIN_ALREADY_EXISTS");
```

### 3. Normalizing & Formatting Errors

Use `normalizeError` to map any error type to a structured representation, then format it using `createErrorResponse`:

```typescript
import { normalizeError, createErrorResponse } from "@irctc/errors";

try {
  // Database unique constraint violation (Prisma P2002)
  await prisma.user.create({ data: { email: "duplicate@example.com" } });
} catch (err) {
  // 1. Normalizes Prisma error P2002 -> ERROR_CODES.CONFLICT (409 status code)
  const normalized = normalizeError(err);
  console.log(normalized.statusCode); // 409
  console.log(normalized.errorCode); // "CONFLICT"

  // 2. Formats to standard ErrorContract payload shape
  const responsePayload = createErrorResponse(normalized);
  res.status(normalized.statusCode).json(responsePayload);
}
```

Format of `responsePayload`:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Conflict.",
    "details": undefined
  }
}
```

#### Validation / Invalid Request Body Example

For input validation failures (e.g. from middleware request schema validation), the response payload returns detailed field constraints under the `details` key:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Invalid request body.",
    "details": {
      "firstName": "Invalid input: expected string, received undefined",
      "lastName": "Invalid input: expected string, received undefined",
      "email": "Invalid email format",
      "password": "Invalid input: expected string, received undefined",
      "confirmPassword": "Invalid input: expected string, received undefined"
    }
  },
  "meta": {
    "requestId": "eadbcea2-1d69-4c36-902f-077899f3290a",
    "traceId": "2b2eea50b1fb1758c80018a55147aa51",
    "timestamp": "2026-07-19T20:41:51.813Z"
  }
}
```

## Database Error Mapping

`normalizePrismaError` maps standard Prisma request engine error codes:

- **`P2002` (Unique Constraint Violation):** Mapped to `CONFLICT`.
- **`P2025` (Record to update/delete not found):** Mapped to `NOT_FOUND`.
- **`P2003` (Foreign key constraint violation):** Mapped to `INVALID_INPUT`.
- Other Prisma errors fall back to `INTERNAL_ERROR`.
