---
description: Add a new gRPC method or new RPC service to the platform. Covers proto editing in packages/contracts/proto/, buf codegen into @irctc/contracts, server handler registration, client singleton, and gRPC error mapping. Triggers on adding a method to packages/contracts/proto/**/*.proto, creating src/grpc/ in a service, or wiring a new client. Does NOT cover REST API design (use the openapi skill), Kafka topics (use the kafka-consumer skill), or Prisma access (use the prisma-repository skill).
when_to_use: "Adding a new gRPC method, scaffolding a gRPC server in a service, writing a typed client that calls another service via gRPC, or debugging ApiError / ServerError mapping at the gRPC boundary."
---

# grpc-service

Every service-to-service RPC in this platform goes through `@irctc/grpc`
on `nice-grpc`. The proto is the contract; `buf` generates the TS
client + service definition into `@irctc/contracts`; the server uses
`createGrpcServer` from `@irctc/grpc`; the client uses `createGrpcClient`.

This skill covers **inventory RPC only** today (one proto file:
`packages/contracts/proto/irctc/inventory/v1/inventory.proto`). When more
protos land, expand this skill.

## The pipeline this skill protects

```
            ┌───────────────────────────────────────────────────────────┐
            │  packages/contracts/proto/irctc/<bounded-context>/v1/    │
            │  <bounded-context>.proto                                 │
            └─────────────────────┬─────────────────────────────────────┘
                                  │ buf generate (pnpm --filter
                                  │ @irctc/contracts build)
                                  ▼
            ┌───────────────────────────────────────────────────────────┐
            │  packages/contracts/generated/irctc/<ctx>/v1/             │
            │    <Ctx>ServiceDefinition                                 │
            │    <Ctx>ServiceImplementation                             │
            │    <Ctx>ServiceClient                                    │
            │    <Message> interface                                    │
            └───────────────┬───────────────────────┬───────────────────┘
                            │                       │
                            ▼                       ▼
       apps/<server-svc>/src/grpc/         apps/<client-svc>/src/grpc/
       ├── <ctx>.handler.ts                 ├── <ctx>.client.ts
       └── server.ts                        └── index.ts  (barrel)
                            │                       │
                            ▼                       ▼
              createGrpcServer()            createGrpcClient()
              from @irctc/grpc               from @irctc/grpc
              add(<Ctx>ServiceDef,           factory.create(def, channel)
                  handler)                   (singleton, lifetime = service)
```

Four rules govern everything below:

1. **Proto is the contract.** TS types are derived. Hand-writing the
   `*ServiceDefinition` or message interfaces is a bug — run
   `pnpm --filter @irctc/contracts build` instead.
2. **Domain errors are `ApiError` on both sides.** Handlers throw
   `ApiError`; `@irctc/grpc`'s error middleware translates to
   `ServerError` at the wire. Clients catch `ClientError` and
   translate back to `ApiError` at the caller boundary.
3. **The gRPC server lifecycle is bound by `server.ts`.** Start before
   `app.listen`, stop after consumers but before Kafka disconnect.
4. **Clients are singletons, scoped to the service.** One `Channel`,
   one `Client`, reused for every call. Never `createChannel` per
   request.

## When this skill runs

Trigger on any of:

- "Add a gRPC method to inventory" / "Add a new proto method"
- "Scaffold a gRPC server in <service>"
- "Write a typed client that calls <service> via gRPC"
- "Translate `ClientError` to `ApiError`"
- Changes under `packages/contracts/proto/`, `apps/*/src/grpc/`,
  `packages/contracts/generated/`, `packages/grpc/src/`.

Do **not** trigger for:

- REST API design or OpenAPI specs — use the `openapi` skill.
- Kafka topics and consumers — use the `kafka-consumer` skill.
- Prisma repository access — use the `prisma-repository` skill.
- Generic TypeScript JSDoc on the gRPC files themselves — use the
  `jsdoc` skill.

## Source of truth — `@irctc/grpc`

Every shared gRPC primitive lives in `packages/grpc/src/`:

| Export                                                       | Use case                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `createGrpcServer()`                                         | server factory with logging + error-mapping middleware pre-installed |
| `createGrpcClient(definition, address, options?)`            | typed client + underlying `Channel`                                  |
| `createGrpcClientFactory(options?)`                          | low-level — only if you need to attach additional middlewares        |
| `mapToGrpcError(error)`                                      | the canonical `ApiError` → `ServerError` translator                  |
| `mapApiCodeToGrpcStatus(code, statusCode?)`                  | the status-code mapping used by `mapToGrpcError`                     |
| `createDeadlineMiddleware({ defaultTimeoutMs? })`            | client-side deadline middleware (already installed by the factory)   |
| `clientLoggingMiddleware`                                    | client-side logging (already installed)                              |
| Server middlewares: `logging.middleware`, `error.middleware` | already installed by `createGrpcServer`                              |

When adding a new gRPC helper, **first check whether `@irctc/grpc`
already provides it**. Adding a parallel implementation breaks the
"single source of truth" guarantee.

## Adding a new method to the inventory RPC

The full lifecycle when the inventory proto gains a new method. Use
this as the canonical walkthrough — every step applies to new protos
in the future with the same shape.

### Step 1 — Edit the proto

Edit `packages/contracts/proto/irctc/inventory/v1/inventory.proto`.
Add the new `rpc` line inside `service InventoryService { ... }` and
the request / response messages alongside the existing ones:

```proto
syntax = "proto3";

package irctc.inventory.v1;

service InventoryService {
  rpc GetSeatDetails (GetSeatDetailsRequest) returns (GetSeatDetailsResponse);
  rpc HoldSeats      (HoldSeatsRequest)      returns (HoldSeatsResponse);
}

message HoldSeatsRequest {
  string schedule_id = 1;
  repeated string seat_ids = 2;
  int64 hold_ttl_ms = 3;
}

message HoldSeatsResponse {
  string hold_id = 1;
  int64 expires_at_ms = 2;
}
```

Conventions:

- `package irctc.<bounded-context>.v1;` — `v1` is mandatory. A breaking
  change = new `v2` file, not a mutation of `v1`.
- Field names are `snake_case` in the proto; `ts_proto` with
  `useOptionals=messages` converts to camelCase TS fields automatically.
- IDs are `string` (UUIDs), not `bytes`. Enums use the protobuf enum
  type, not `int32`.
- Timestamps are `int64` epoch milliseconds or `string` ISO-8601.
  Prefer `int64` for new methods to avoid parser ambiguity.
- Run `pnpm --filter @irctc/contracts buf:lint` before regenerating.

### Step 2 — Regenerate the TS types

```bash
pnpm --filter @irctc/contracts build
```

This runs `buf generate` then `tsc`. Verify the new method appears in
`packages/contracts/generated/irctc/inventory/v1/inventory.d.ts` —
both on `InventoryServiceDefinition.methods.<NewMethod>` and on
`InventoryServiceImplementation.<newMethod>` / `InventoryServiceClient.<newMethod>`.

### Step 3 — Implement the handler (server side)

Edit `apps/inventory-service/src/grpc/inventory.handler.ts`. The handler
implements `InventoryServiceImplementation`. Add the new method:

```ts
import {
  type InventoryServiceImplementation,
  type HoldSeatsRequest,
  type HoldSeatsResponse,
} from "@irctc/contracts";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { prisma } from "@config";
import { logger } from "@irctc/logger";

export const inventoryHandler: InventoryServiceImplementation = {
  async getSeatDetails(request) {
    /* existing */
  },

  async holdSeats(request: HoldSeatsRequest): Promise<HoldSeatsResponse> {
    const { scheduleId, seatIds, holdTtlMs } = request;

    if (!scheduleId || seatIds.length === 0) {
      // ERROR_CODES.BAD_REQUEST is dead code (see drift callout below).
      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.INVALID_INPUT,
        "scheduleId and at least one seatId are required.",
      );
    }

    // Business flow lives in the service layer. Handlers are thin.
    const hold = await this.seatAllocationService.holdSeats({
      scheduleId,
      seatIds,
      holdTtlMs,
    });

    return { holdId: hold.id, expiresAtMs: hold.expiresAt.getTime() };
  },
};
```

Conventions:

- **Handlers are thin.** They translate the gRPC request, delegate to
  a service, translate the service result back. They do NOT call Prisma
  directly. The current `inventory.handler.ts` violates this for
  `getSeatDetails` (calls `prisma.seatInventory.findUnique` inline) —
  if you're touching that handler, fold the call into
  `SeatInventoryService.getSeatDetails` first.
- **Throw `ApiError` for domain failures.** `mapToGrpcError` (already
  installed by `createGrpcServer`) translates to `ServerError`.
- **Use `import type`** for the generated `*ServiceImplementation`
  type. ts_proto emits it as a type-only export.
- **Log via the canonical `logger.error({ module, err }, ...)` pattern**
  for unexpected failures only. Validation errors are expected — don't
  log them.

### Step 4 — Register the handler in `server.ts`

`apps/inventory-service/src/grpc/server.ts` already calls
`grpcServer.add(InventoryServiceDefinition, inventoryHandler)`. **You
don't need to touch it when adding a method to an existing service.**
You do need to touch `server.ts` itself only when the service is
brand new or the port changes.

### Step 5 — Wire the client (caller side)

In the calling service (e.g. `apps/booking-service/src/grpc/inventory.client.ts`):

```ts
import { createGrpcClient, type Channel } from "@irctc/grpc";
import {
  InventoryServiceDefinition,
  type InventoryServiceClient,
} from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { env } from "@config";

let channel: Channel | undefined;
let client: InventoryServiceClient | undefined;

export const getInventoryGrpcClient = (): InventoryServiceClient => {
  if (!client) {
    logger.info(
      { module: "grpc-client" },
      `Connecting gRPC channel to http://${env.INVENTORY_GRPC_URL}`,
    );

    const res = createGrpcClient(
      InventoryServiceDefinition,
      env.INVENTORY_GRPC_URL,
      { defaultTimeoutMs: 3000 },
    );

    channel = res.channel;
    client = res.client as unknown as InventoryServiceClient;
  }

  return client;
};

export const closeInventoryGrpcChannel = async (): Promise<void> => {
  if (channel) {
    logger.info({ module: "grpc-client" }, "Closing inventory gRPC channel...");
    channel.close();
    channel = undefined;
    client = undefined;
  }
};
```

Conventions:

- **One module-level singleton** per remote service. The first call
  creates the `Channel`; subsequent calls return the cached client.
- **`defaultTimeoutMs`** is required. The default of 3000 is fine for
  most calls; raise it for known-slow operations (long-running writes)
  and document why in a comment.
- **Re-export through `src/grpc/index.ts`** as a barrel. Services
  import `getInventoryGrpcClient` from `@grpc`, never from the leaf
  file.
- **Wire `closeInventoryGrpcChannel` into `server.ts` shutdown**,
  between `stopGrpcServer()` (if the service is itself a server) and
  `prisma.$disconnect()`. See `bootstrap.md` for the full shutdown
  sequence.

### Step 6 — Call the new method from a service

```ts
import { getInventoryGrpcClient } from "@grpc";
import { ClientError } from "nice-grpc";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";

async holdSeats(dto: HoldSeatsRequestDto): Promise<HoldResult> {
  const client = getInventoryGrpcClient();
  try {
    const res = await client.holdSeats({
      scheduleId: dto.scheduleId,
      seatIds: dto.seatIds,
      holdTtlMs: 5 * 60 * 1000,
    });
    return { holdId: res.holdId, expiresAt: new Date(res.expiresAtMs) };
  } catch (error) {
    if (error instanceof ClientError) {
      throw mapClientErrorToApiError(error); // see Step 7
    }
    throw error;
  }
}
```

### Step 7 — `ClientError` → `ApiError` mapping (callers)

`@irctc/grpc` ships `mapToGrpcError` for the server side. The caller
needs the inverse: a `ClientError` → `ApiError` translator. Today
neither `@irctc/grpc` nor any service exports this helper — each
service rolls its own. **Add `mapClientErrorToApiError` to
`@irctc/grpc/src/errors/mapper.ts`** before writing multiple call
sites; otherwise extract it into the first service that needs it
(`apps/booking-service/src/grpc/index.ts`) and lift it once the
second caller appears.

Canonical shape:

```ts
import { ClientError, Status } from "nice-grpc";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";

export const mapClientErrorToApiError = (error: ClientError): ApiError => {
  switch (error.code) {
    case Status.NOT_FOUND:
      return new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        error.details,
      );
    case Status.INVALID_ARGUMENT:
      return new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        error.details,
      );
    case Status.UNAUTHENTICATED:
      return new ApiError(
        statusCode.unauthorized,
        COMMON_ERROR_CODES.UNAUTHORIZED,
        error.details,
      );
    case Status.PERMISSION_DENIED:
      return new ApiError(
        statusCode.forbidden,
        COMMON_ERROR_CODES.FORBIDDEN,
        error.details,
      );
    case Status.ALREADY_EXISTS:
      return new ApiError(
        statusCode.conflict,
        COMMON_ERROR_CODES.CONFLICT,
        error.details,
      );
    case Status.RESOURCE_EXHAUSTED:
      return new ApiError(
        statusCode.tooManyRequests,
        COMMON_ERROR_CODES.RATE_LIMIT_EXCEEDED,
        error.details,
      );
    case Status.UNAVAILABLE:
      return new ApiError(
        statusCode.serviceUnavailable,
        COMMON_ERROR_CODES.SERVICE_UNAVAILABLE,
        error.details,
      );
    default:
      return new ApiError(
        statusCode.internalServerError,
        COMMON_ERROR_CODES.INTERNAL_ERROR,
        error.details,
      );
  }
};
```

Use this in every catch block — never let a `ClientError` escape a
service. Controllers must only ever see `ApiError`.

## Known drift to fix (separate change)

`packages/grpc/src/errors/mapper.ts` and `apps/inventory-service/src/grpc/inventory.handler.ts`
both reference `ERROR_CODES.VALIDATION_ERROR` and `ERROR_CODES.BAD_REQUEST`.
Neither is exported from `@irctc/errors` (only `COMMON_ERROR_CODES.INVALID_INPUT`
exists for the validation case). The `mapToGrpcError` mapper's status-code
fallback branch handles them correctly, so the runtime is fine — but the
named-code cases are dead code, and `inventory.handler.ts` uses one of them
(`BAD_REQUEST`) at a real call site, which means the `code` field of the
error response is the dead string `"BAD_REQUEST"` instead of `"INVALID_INPUT"`.

**Fix in a separate change**: drop the two dead `case` branches in
`mapper.ts` and replace `ERROR_CODES.BAD_REQUEST` in the handler with
`ERROR_CODES.INVALID_INPUT`. Until that change lands, **never write new
code that depends on `VALIDATION_ERROR` or `BAD_REQUEST`** codes — they
look exported but resolve to `undefined` at runtime.

## Conventions every gRPC file must satisfy

1. **Handler methods throw `ApiError`, not raw `Error`** or `ServerError`.
2. **Server lifecycle is bound by `server.ts`** — start before `app.listen`,
   stop after consumer shutdown but before Kafka disconnect.
3. **Clients are singletons** — never `createChannel` per request.
4. **All gRPC types come from `@irctc/contracts`** — never hand-write
   the `*ServiceDefinition` or message interfaces.
5. **gRPC errors cross the boundary as `ApiError`** — never let
   `ClientError` or `ServerError` reach a controller.
6. **Deadlines are bounded** — set `defaultTimeoutMs` on every client.
   3000 is the default; raise it with a comment when a method needs
   more headroom.
7. **No PII in gRPC log payloads** — see `rules/logging.md`. The
   client logging middleware logs the method name + latency, not the
   payload.

## Common mistakes

### "I edited the proto but TS doesn't see the new method."

`pnpm --filter @irctc/contracts build` regenerates. Restart the
TypeScript server if your editor still shows stale types.

### "The handler runs but the client sees `Status.UNKNOWN`."

The handler threw a non-`ApiError`. `mapToGrpcError` falls back to
`Status.INTERNAL` only when the error isn't recognised; `Status.UNKNOWN`
means the error middleware didn't fire at all. Check that
`createGrpcServer()` is what's building the server (not raw
`nice-grpc`'s `createServerFactory`) — the middleware chain is in
`@irctc/grpc/src/server/factory.ts`.

### "Client times out after 3000ms even though I set a longer deadline."

`createGrpcClient`'s third argument is the _factory_ options, not
per-call. Per-call deadline goes on the call options object:
`client.holdSeats(request, { deadline: 10_000 })`.

### "The channel stays open after the service shuts down."

`closeInventoryGrpcChannel` wasn't called in the shutdown sequence.
Add it between `stopGrpcServer()` (if applicable) and `prisma.$disconnect()`.

### "Orval generated types collide with the gRPC client type."

They share the `*ServiceClient` name across the merged gateway spec
and `@irctc/contracts`. The grpc-service skill keeps gRPC imports on
`@irctc/contracts` directly — never re-export through `@irctc/openapi`
or any package the gateway spec scans.

## Out of scope

- REST API design, OpenAPI specs, response envelopes — `openapi` skill.
- Kafka consumers, idempotency, DLQ — `kafka-consumer` skill.
- Prisma repository access, transaction propagation — `prisma-repository`
  skill.
- gRPC-Web / streaming / bidirectional flows — not used in this
  project today.
- Authentication at the gRPC layer (mTLS, OIDC bearer) — not used in
  this project today. When added, this skill grows a section.

## Supporting files

- `drift.md` — the known mapper.ts / handler.ts drift and the planned
  fix. Read this before writing any new code that maps errors at the
  gRPC boundary.
