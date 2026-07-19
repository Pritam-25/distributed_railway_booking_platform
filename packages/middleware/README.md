# @irctc/middleware

Centralized Express middleware components for the IRCTC-style distributed railway booking platform.

## Features

- **Error Handling (`errorHandler` & `notFoundHandler`):** Intercepts exceptions globally, normalizes them, and returns standardized JSON error responses.
- **Request Context (`requestId` & `requestLogger`):** Generates and attaches unique request IDs to each connection and logs metrics (duration, path, HTTP verbs).
- **Validation Middlewares (`validateSchema`, `validateQuery`, `validateParams`):** Integrates Zod schemas to validate request body, query parameters, and route parameters dynamically.
- **Auth Guard (`auth`):** Validates session JSON Web Tokens (JWTs) and asserts authorization constraints based on roles (User, Admin).
- **Async Utility (`asyncHandler`):** Wrapper simplifying error propagation in Express controller functions using `Promise` resolve pipelines.

## Directory Structure

```text
packages/middleware/
├── src/
│   ├── asyncHandler.ts     # Wrapper for async routes to catch errors
│   ├── auth.ts             # JWT authentication and RBAC validation
│   ├── errorHandler.ts     # Global express error responder
│   ├── notFoundHandler.ts  # Fallback handler for unmatched paths
│   ├── requestId.ts        # Request ID injector middleware
│   ├── requestLogger.ts    # HTTP request/response metrics logger
│   ├── validateParams.ts   # Zod validator for route path parameters
│   ├── validateQuery.ts    # Zod validator for URL search parameters
│   ├── validateSchema.ts   # Zod validator for HTTP body payloads
│   └── index.ts            # Main entry point exports
```

## Usage

### 1. Registering Core Global Middlewares

Register infrastructure middlewares in your Express application startup file:

```typescript
import express from "express";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandlerMiddleware,
  notFoundHandler,
} from "@irctc/middleware";

const app = express();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

// ... mount routes here ...

// Register fallback routes & error interceptor last
app.use(notFoundHandler);
app.use(errorHandlerMiddleware);
```

### 2. Request Validation Middlewares

Validate incoming path parameters, query params, and body schemas using Zod:

```typescript
import { Router } from "express";
import {
  validateSchema,
  validateQuery,
  validateParams,
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
    // Parameter, query, and body data are parsed and typed here
    const { id } = req.params;
    const { date } = req.query;
    const { passengers } = req.body;

    res.json({ success: true });
  }),
);
```

### 3. Authentication & Authorization Guard

Protect API endpoints based on user session roles:

```typescript
import { Router } from "express";
import { auth, asyncHandler } from "@irctc/middleware";

const router = Router();

// User authenticated routes
router.get(
  "/profile",
  auth(),
  asyncHandler(async (req, res) => {
    // Access authenticated context
    const user = req.user;
    res.json({ user });
  }),
);

// Admin restricted routes
router.post(
  "/trains",
  auth(["ADMIN"]),
  asyncHandler(async (req, res) => {
    res.json({ message: "Train created successfully" });
  }),
);
```
