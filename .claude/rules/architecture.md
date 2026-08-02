# Architecture

Layered architecture, container-based DI, transactional outbox. Deviations across services are bugs — consistency beats local cleverness.

## Layered ownership

Inside `apps/<service>/src/`:

```
Routes → Controllers → Services → Repositories → Prisma / Redis / Kafka
```

| Layer                    | Owns                                                                             | Forbidden                                                                 |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Routes                   | URL → method binding, validation middleware, container lookup                    | business logic, Prisma, Redis, Kafka                                      |
| Controllers              | HTTP request/response, `successResponse` / `paginatedResponse` / `errorResponse` | Prisma queries, Redis calls, Kafka publishing, validation schemas         |
| Services                 | Business logic, transaction orchestration, outbox writes                         | direct `prisma.*` access, raw `producer.send`, unmapped `throw new Error` |
| Repositories             | All Prisma access for a model, transaction client propagation                    | business rules, calling other repositories, Kafka                         |
| DTOs (`src/dto/`)        | Zod schemas + inferred types only                                                | runtime logic                                                             |
| Mappers (`src/mappers/`) | Prisma → event / DTO conversion, Zod `parse`                                     | business logic, I/O                                                       |
| Utils (`src/utils/`)     | Pure helpers, error code/message tables                                          | service-wide state                                                        |

## Service template

```
apps/<service>/
├── prisma/{schema.prisma,migrations/}
├── src/
│   ├── api/v1/routes/        # Express routers
│   ├── config/               # env, prisma, kafka, redis
│   ├── container/            # DI singleton
│   ├── controllers/          # HTTP handlers
│   ├── dto/                  # Zod schemas + DTO types
│   ├── mappers/              # Prisma → event mappers
│   ├── middleware/           # service-specific auth, etc.
│   ├── repository/           # Prisma access
│   ├── services/             # business logic
│   ├── utils/errors/         # ERROR_CODES + ERROR_MESSAGES
│   ├── workers/              # background loops
│   ├── consumers/            # Kafka consumers
│   ├── grpc/                 # gRPC server + clients (if applicable)
│   ├── app.ts                # express() + middleware stack
│   └── server.ts             # bootstrap + graceful shutdown
└── package.json
```

Add or omit `grpc/`, `workers/`, `consumers/` per the domain.

## Dependency Injection

- One `Container` class per service at `src/container/<service>.container.ts`, re-exported through `src/container/index.ts`.
- Singleton: `static getInstance(): Container`. Repositories first, then services, then controllers.
- Public fields only on the **edges** consumers use: controllers (for routes) and any cross-cutting repo (e.g. `outboxRepository`).
- The container does **not** start consumers, workers, or HTTP — `server.ts` calls `Container.getInstance()` and wires those.
- `app.ts` imports controllers via the container barrel (`import { trainController } from "@container"`).

## Transactions

- Multi-write business operations (state change + outbox insert) MUST run inside `prisma.$transaction(async (tx) => …)`.
- Repositories accept an optional `tx?: Prisma.TransactionClient` and fall back to `prisma` when omitted. **Every** writeable method follows this pattern.
- Never hold a transaction while doing I/O outside the DB (Kafka publish, network calls). Publish from the outbox worker after the transaction commits.

## Cross-service events

- Events are **contracts**, not messages. Every event is a versioned Zod schema (`<EventName>V1`) in `packages/contracts/src/<bounded-context>/`.
- Services publish by writing to the `outboxEvent` table inside a transaction. The outbox publisher worker drains the table to Kafka.
- Services consume by parsing through the Zod schema, then running the business flow with idempotency. See `kafka-consumer` skill.

## Cross-service RPC

- gRPC for synchronous service-to-service calls. See `grpc-service` skill for proto edits, codegen, server registration, client singleton, and error mapping.
- The gRPC boundary uses `@irctc/grpc` factories (`createGrpcServer`, `createGrpcClient`). Direct `nice-grpc` calls in services are forbidden.
- gRPC errors thrown by handlers are translated via `mapToGrpcError` from `@irctc/grpc`. Callers in other services catch `ClientError` and translate back to `ApiError` at the boundary.
