# Bootstrap — `server.ts`, `app.ts`, health

Every service has the same startup sequence, the same shutdown order, and the same two health endpoints. Deviations are bugs.

## `server.ts` responsibilities

`server.ts` is the only file allowed to:

- import `process`, register `process.on(...)` handlers
- touch `prisma.$connect` / `prisma.$disconnect`
- call `initKafka()` / `disconnectKafka()`
- call `initRedis()` (when the service uses Redis)
- call `startGrpcServer()` / `stopGrpcServer()` (when the service exposes gRPC)
- instantiate the container and start background workers / consumers
- `app.listen(PORT)`

Everything else (route registration, middleware stack, error handler) belongs in `app.ts`.

## Startup sequence

```ts
// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

// 2. Logger first, then connect dependencies in order.
await prisma.$connect();
await initRedis();         // only if the service uses Redis
await initKafka();         // also initialises the Kafka producer
await startGrpcServer(env.GRPC_PORT);  // only if the service exposes gRPC

// 3. Bind the port last.
const { default: app } = await import("./app.js");
server = app.listen(PORT, () => { /* logger.info */ });

// 4. Start background work after the port is bound.
const container = MyServiceContainer.getInstance();
new OutboxPublisherWorker(container.outboxRepository).start();
await container.<eventName>Consumer.start();
```

`app.ts` is imported dynamically so its top-level side effects (middleware registration) only run once the dependencies are ready.

## Graceful shutdown

`SIGINT` and `SIGTERM` must trigger the same `shutdown` routine. Order matters:

1. Stop accepting new HTTP traffic: `await new Promise(... server.close ...)` (drains in-flight requests).
2. Stop background workers (`outboxWorker.stop()`, hold-expiry worker, etc.).
3. Disconnect Kafka consumers first, then `disconnectKafka()` (producer).
4. `stopGrpcServer()` if the service exposes gRPC.
5. `await prisma.$disconnect()`.
6. `await shutdownTelemetry()`.
7. `process.exit(exitCode)`.

Wrap every step in a bounded `Promise.race` timeout helper (target 5s) with a `clearTimeout` in `finally`. Use `isShuttingDown` to make the handler idempotent.

Handle `unhandledRejection` and `uncaughtException` with `logger.error` + `shutdown(signal, 1)`. Never let the process die without a clean drain.

## `app.ts` middleware order

Apply in this exact order. Each line earns its place.

```ts
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, allowedHeaders: [...], exposedHeaders: [...] }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestIdMiddleware);   // from @irctc/middleware
app.use(requestLoggerMiddleware);
// Health probes BEFORE auth / versioned routes so k8s always sees them.
app.use("/health", healthRoutes);
app.use("/api/v1", router);
app.use(errorHandler);          // LAST
```

Expose `X-Request-ID` and `X-Trace-ID` via CORS `exposedHeaders` so clients can correlate.

## Health endpoints

Two routes, both under `/health`:

- `GET /health/live` — liveness, returns `200 OK` if the process is up. No dependency calls. k8s liveness probe decides whether to restart.
- `GET /health/ready` — readiness, runs a bounded check of Prisma, Redis (if used), Kafka producer, gRPC (if applicable). Returns `200 OK` when all are healthy, `503 Service Unavailable` when any are not. k8s readiness probe gates traffic.

Every dependency probe inside `/health/ready` must be wrapped in `Promise.race` against a `setTimeout` (target 5s) with `clearTimeout` in `finally`. The default kafkajs / Prisma / ioredis / nice-grpc timeouts are 30s+; without an explicit bound a slow dependency hangs `Promise.all` and the orchestrator fails to mark the pod NotReady in time.

Each check returns `{ name: "prisma", ok: boolean, latencyMs: number, error?: string }`. Never throw from a check — convert errors to `{ ok: false, error: ... }`.

## Consumer / worker startup

Background work (Kafka consumers, outbox publisher, hold-expiry worker) starts **after** `app.listen`. They MUST be stoppable on shutdown (see `stop()` on `OutboxPublisherWorker` as the canonical pattern). The server keeps a reference to each so `shutdown` can call `.stop()` before disconnecting Kafka.

## gRPC server startup

When the service exposes gRPC, `startGrpcServer(port)` runs **before** `app.listen` so the gRPC port is bound at the same time as HTTP. `stopGrpcServer()` runs **after** consumer shutdown but **before** Kafka disconnect — gRPC may need to flush pending responses during shutdown.
