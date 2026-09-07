# @irctc/middleware

Centralized Express middleware components for the IRCTC-style distributed railway booking platform.

## Features

- **Direct Platform Logging:** Integrates directly with `@irctc/logger` to attach child loggers bound to incoming request correlation IDs (`x-request-id`).
- **Error Handling (`errorHandler` & `notFoundHandler`):** Intercepts exceptions globally, normalizes them, logs 500-level errors with request IDs, and returns standardized JSON error envelopes.
- **Request Context (`requestIdMiddleware` & `requestLoggerMiddleware`):** Assigns or forwards unique request correlation IDs, sets `X-Request-Id` headers, and logs duration, path, HTTP verb, status code, and trace IDs upon completion.
- **Validation Middlewares (`validateSchema`, `validateQuery`, `validateParams`):** Integrates Zod schemas to validate request body, query parameters, and route parameters dynamically.
- **Auth Guard (`auth`):** Validates session JWT tokens and asserts authorization constraints based on roles (User, Admin).
- **Async Utility (`asyncHandler`):** Wrapper simplifying error propagation in Express controller functions.
- **Centralized Types:** Re-exports middleware options and Express request/response type augmentations from `src/types.ts`.

## Directory Structure

```text
packages/middleware/
├── src/
│   ├── asyncHandler.ts     # Wrapper for async routes to catch errors
│   ├── auth.ts             # JWT authentication and RBAC validation
│   ├── errorHandler.ts     # Global express error responder using @irctc/logger
│   ├── express.ts          # Express Request/Response type augmentations
│   ├── notFoundHandler.ts  # Fallback handler for unmatched paths
│   ├── requestId.ts        # Request ID injector middleware using @irctc/logger
│   ├── requestLogger.ts    # HTTP request/response metrics logger using @irctc/logger
│   ├── validateHeaders.ts  # Zod validator for HTTP headers
│   ├── validateParams.ts   # Zod validator for route path parameters
│   ├── validateQuery.ts    # Zod validator for URL search parameters
│   ├── validateSchema.ts   # Zod validator for HTTP body payloads
│   ├── types.ts            # Centralized middleware options interfaces
│   └── index.ts            # Main entry point exports
```

## Usage

### 1. Registering Core Global Middlewares

```typescript
import express from "express";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
  notFoundHandler,
} from "@irctc/middleware";

const app = express();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

// ... mount routes here ...

// Register fallback routes & error interceptor last
app.use(notFoundHandler);
app.use(errorHandler);
```

### 2. Request Validation Middlewares

```typescript
import { Router } from "express";
import {
  validateSchema,
  validateQuery,
  validateParams,
  asyncHandler,
} from "@irctc/middleware";
import { z } from "zod";

const router = Router();

const searchSchema = z.object({
  date: z.string().datetime(),
});

const pathSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.object({
  passengers: z.array(z.string()),
});

router.post(
  "/trains/:id/book",
  validateParams(pathSchema),
  validateQuery(searchSchema),
  validateSchema(bodySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { date } = req.query;
    const { passengers } = req.body;

    res.json({ success: true, bookingId: id });
  }),
);
```

### 3. Authentication & Authorization Guard

```typescript
import { Router } from "express";
import { authUser, authAdmin, asyncHandler } from "@irctc/middleware";

const router = Router();

// User authenticated routes
router.get(
  "/profile",
  authUser,
  asyncHandler(async (req, res) => {
    const user = req.user;
    res.json({ user });
  }),
);

// Admin restricted routes
router.post(
  "/trains",
  authAdmin,
  asyncHandler(async (req, res) => {
    const admin = req.admin;
    res.json({ message: "Train created successfully" });
  }),
);
```
