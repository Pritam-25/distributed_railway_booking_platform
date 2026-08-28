# @irctc/http

Centralized HTTP application factory, context management, standardized JSON response formatters, and Kubernetes readiness/liveness router for the IRCTC-style distributed railway booking platform.

## Features

- **Express App Composition (`createApp`):** Mounts security headers (Helmet), CORS, JSON parsers, health probes, and standard middleware pipelines in a single constructor.
- **Kubernetes Health Probe Router (`createHealthRouter`):** Mounts `/health/live` (process liveness) and `/health/ready` (dependency probes with bounded timeouts).
- **Dependency Health Adapters:** Includes readiness check helpers `checkDatabaseHealth` (Prisma) and `checkElasticsearchHealth`.
- **Request Context (`AsyncLocalStorage`):** Scopes request-specific metadata (`requestId`) down call stacks automatically using Node's `AsyncLocalStorage`.
- **OpenTelemetry Correlation:** Integrates with `@opentelemetry/api` to capture trace IDs (`getTraceId`).
- **Standardized Response Envelopes:** Standard success, paginated, and error wrappers that format responses with correlation metadata (`requestId`, `traceId`, `timestamp`).

## Directory Structure

```text
packages/http/
├── src/
│   ├── app/        # Express application factory (createApp)
│   ├── health/     # Kubernetes health router & readiness probes
│   ├── constants/  # Standard HTTP status code constants
│   ├── context/    # AsyncLocalStorage and OpenTelemetry context accessors
│   ├── response/   # Standardized API response formatters
│   ├── types.ts    # Centralized HTTP & health check types
│   └── index.ts    # Main entry point exports
```

## Usage

### 1. Creating an Express Application (`createApp`)

```typescript
import {
  createApp,
  createHealthRouter,
  checkDatabaseHealth,
} from "@irctc/http";
import { checkRedisHealth } from "@irctc/redis";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
  notFoundHandler,
} from "@irctc/middleware";
import { prisma, redis } from "@config";
import router from "./routes/index.js";

const healthRouter = createHealthRouter({
  dependencies: [
    { name: "database", check: () => checkDatabaseHealth(prisma) },
    { name: "redis", check: () => checkRedisHealth(redis) },
  ],
});

const app = createApp({
  serviceName: "booking-service",
  router,
  healthRouter,
  middleware: {
    requestId: requestIdMiddleware,
    requestLogger: requestLoggerMiddleware,
    notFoundHandler,
    errorHandler,
  },
});
```

### 2. Standardized Response Envelopes

```typescript
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  statusCode,
} from "@irctc/http";

// Success Response
res.status(statusCode.success).json(
  successResponse("User profile retrieved successfully", {
    id: "u-123",
    name: "Alice",
  }),
);

// Paginated Response
res.status(statusCode.success).json(
  paginatedResponse("Bookings list", {
    data: [{ id: "b-1" }],
    metadata: { total: 100, page: 1, limit: 10, totalPages: 10 },
  }),
);

// Error Response
res.status(statusCode.badRequest).json(errorResponse(error));
```
