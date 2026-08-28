# @irctc/grpc

Centralized gRPC server and client factories, authentication middlewares, deadline propagation, and health check handlers for the IRCTC-style distributed railway booking platform.

## Features

- **Server & Client Factories:** Pre-configures `nice-grpc` Server and ClientFactory instances loaded with deadline propagation, server/client logging middlewares, and internal bearer token authentication.
- **Direct Platform Logging:** Directly imports `@irctc/logger` to log RPC invocations, status codes, latencies, and server/client errors automatically without parameter threading.
- **gRPC Health Service (`grpc.health.v1.Health`):** Standard health implementation (`createGrpcHealthHandler`) managing liveness and readiness probes across microservice dependencies.
- **Centralized Types:** Re-exports all core `nice-grpc` types (`Server`, `Channel`, `ServerError`, `ClientError`, `Status`, `Metadata`) and gRPC health interfaces from `src/types.ts`.

## Directory Structure

```text
packages/grpc/
├── src/
│   ├── client/          # gRPC client factory & client middlewares
│   ├── server/          # gRPC server factory & server middlewares
│   ├── health/          # Standard gRPC health service implementation
│   ├── types.ts         # Centralized gRPC types & options interfaces
│   └── index.ts         # Main entry point exports
```

## Usage

### 1. Starting a gRPC Server

```typescript
import { createGrpcServer, createGrpcHealthHandler } from "@irctc/grpc";
import { InventoryServiceDefinition, HealthDefinition } from "@irctc/contracts";
import { env } from "@config";

const server = createGrpcServer({
  auth: {
    mode: "bearer",
    expectedToken: env.GRPC_INTERNAL_AUTH_TOKEN,
  },
});

const healthHandler = createGrpcHealthHandler({
  dependencies: [
    { name: "database", check: () => checkDatabaseHealth(prisma) },
    { name: "redis", check: () => checkRedisHealth(redis) },
  ],
});

server.add(InventoryServiceDefinition, inventoryHandler);
server.add(HealthDefinition, healthHandler);

await server.listen("0.0.0.0:50051");
```

### 2. Creating a gRPC Client

```typescript
import { createGrpcClient } from "@irctc/grpc";
import { InventoryServiceDefinition } from "@irctc/contracts";
import { env } from "@config";

const { client, channel } = createGrpcClient(
  InventoryServiceDefinition,
  env.INVENTORY_GRPC_URL,
  {
    defaultTimeoutMs: 3000,
    auth: {
      mode: "bearer",
      token: env.GRPC_INTERNAL_AUTH_TOKEN,
    },
  },
);

// Call gRPC methods directly
const response = await client.checkAvailability({
  scheduleId: "sch-123",
  coachClass: "3A",
});
```
