# Booking Domain Implementation Plan

## Context

The `distributed_railway_booking_platform` monorepo has the infrastructure for a train-booking system but only the inventory domain is built. The user wants the booking domain end-to-end, following the **saga orchestrator pattern** — booking-service owns the lifecycle state machine and communicates with participants via **Kafka events**, with **gRPC** reserved for the single synchronous hop where the orchestrator needs an immediate answer to proceed (the `payment.CreateOrder` call between `SEATS_HELD` and `PAYMENT_PENDING`).

This is **not** the same shape as `D:\dev\itctc-clone`. The itctc-clone prototype used `fetch(${PAYMENT_SERVICE_URL}/.../orders, ...)` over HTTP for the synchronous payment kickoff. The distributed platform has full **gRPC** infrastructure (`@irctc/grpc`, `nice-grpc`, buf-generated contracts) and the architecture rules say **never use HTTP `fetch` for interservice communication** — direct `nice-grpc` calls outside `@irctc/grpc` are forbidden, and so is HTTP between services. The synchronous payment kickoff therefore goes through the new `payment-service` gRPC stub via `createGrpcClient(PaymentServiceDefinition, ...)`, not an HTTP fetch.

**Key decisions already made:**

- **Pattern**: **Saga orchestrator** — booking-service is the orchestrator. Inventory + payment + booking all communicate via Kafka events; the orchestrator drives the booking state machine via consumer handlers + a `SagaLog` table
- **Scope**: Full booking flow (`PENDING → SEATS_HELD → PAYMENT_PENDING → CONFIRMING → CONFIRMED` plus `FAILED` / `EXPIRED` / `CANCELLING → CANCELLED`)
- **Inventory integration**: Pure Kafka + transactional outbox. The orchestrator emits `BOOKING_HOLD_SEATS_REQUESTED`; inventory consumes it, allocates seats, emits `INVENTORY_SEATS_HELD` / `INVENTORY_SEATS_HOLD_FAILED` / `INVENTORY_SEAT_HOLD_EXPIRED` back via outbox. **One synchronous gRPC pre-flight in `BookingService.createBooking`** — a focused schedule-level `ValidateBooking` call that surfaces the cheap-invariant failures (`SCHEDULE_NOT_FOUND`, `SCHEDULE_INACTIVE`, `TRAIN_ALREADY_DEPARTED`) before any booking row is written. The previous `CheckAvailability` per-seat per-segment pre-flight was removed; `ValidateBooking` is narrow and the per-seat / per-segment check stays in inventory's authoritative `holdSeats` consumer where it belongs. The Redis segment-aware seat-lock + idempotency key still cover the same races the old `CheckAvailability` was guarding against, and the segment-aware key shape (see Appendix A.4) means a stale Redis lock and a fresh `holdSeats` cannot disagree
- **Payment integration**: New `payment-service` gRPC stub. The orchestrator calls `payment.CreateOrder` via **gRPC** (via `@irctc/grpc`'s `createGrpcClient(PaymentServiceDefinition, ...)`) from inside `BookingSagaOrchestrator.handleSeatsHeld`, between `SEATS_HELD` and `PAYMENT_PENDING`. The reply is the `paymentOrderId` we persist on the booking row. Webhook → `PaymentSuccess` event → orchestrator advances to `CONFIRMING → CONFIRMED`
- **Seat-map endpoint**: Stays where the seat-map plan puts it — **`search-service`** owns `GET /api/v1/search/schedules/:scheduleId/seat-map`, which calls `inventory.GetSeatMap` over gRPC. The booking flow doesn't read the seat-map; it only writes. (See `d-dev-distributed-railway-booking-platf-glowing-star.md` for the seat-map screen plan.)
- **Idempotency**: `BookingIdempotencyKey` DB table for the create path (HTTP-layer dedupe of `POST /bookings`). Two-phase Redis `IdempotencyRepository` (`reserveIfNew` → `markProcessed` / `release`) on every consumer-side saga handler. The orchestrator reuses `IdempotencyRepository` from `@irctc/redis` with a `saga` keyspace

**Architectural anchors:**

- **gRPC for sync hops only** — the payment `CreateOrder` is the only sync call in the booking flow because the orchestrator needs the `paymentOrderId` immediately to flip the booking to `PAYMENT_PENDING`. Every other interaction is event-driven
- **Kafka + transactional outbox** for everything that is "tell the world something happened" (hold requested, seats held, seats hold failed, seat hold expired, booking confirmed, booking cancelled, payment success)
- **Two-phase Redis idempotency on the consumer side**: `reserveIfNew` (cheap short-circuit) + DB-level CAS guards inside the transaction
- **Optimistic concurrency** via `version` columns + `updateMany({ where: { version: { lt: newVersion } } })` predicates
- **The orchestrator owns the saga log**: every saga-step transition (`HOLD_SEATS → COMPLETED`, `CREATE_PAYMENT → COMPLETED`, etc.) is a row in `saga_logs` written inside the same transaction as the booking status CAS. A failed step writes `FAILED` / `COMPENSATED`

**Reference (read-only):** the itctc-clone prototype has the same orchestrator pattern but uses HTTP fetch for the payment kickoff. The plan below **does not copy that fetch call** — it uses gRPC because the platform has gRPC and the architecture rules require it.

---

## Step 1 — Add booking domain to `@irctc/contracts`

### 1a. Kafka topics, event types, consumer groups

**New file: `packages/contracts/src/booking/booking-events.v1.ts`**

Zod schemas for:

- `HoldSeatsRequestedV1` — `{ eventId, bookingId, scheduleId, seatIds, fromStationId, toStationId, holdTtlMs, createdAt }`
- `SeatsHeldV1` — `{ eventId, bookingId, scheduleId, holdExpiresAt, allocations: [{ seatInventoryId, seatId, coachId, coachNumber, seatNumber, seatType, fromSequence, toSequence, price }], createdAt }`
- `SeatsHoldFailedV1` — `{ eventId, bookingId, scheduleId, reason: "SEAT_ALREADY_HELD" | "SEGMENT_CONFLICT" | "SCHEDULE_NOT_FOUND" | "SCHEDULE_CANCELLED" | "SEAT_NOT_FOUND" | "INTERNAL_ERROR", createdAt }`
- `SeatHoldExpiredV1` — `{ eventId, bookingId, scheduleId, createdAt }`
- `BookingConfirmedV1` — `{ eventId, bookingId, scheduleId, seatInventoryIds, confirmedAt, createdAt }`
- `BookingCancelledV1` — `{ eventId, bookingId, userId, scheduleId, reason, refundAmount, createdAt }`
- `PaymentOrderCreatedV1` — `{ eventId, bookingId, paymentOrderId, amount, createdAt }`
- `PaymentSuccessV1` — `{ eventId, bookingId, paymentId, orderId, amount, source: "CLIENT" | "WEBHOOK", createdAt }`

**New file: `packages/contracts/src/booking/index.ts`** — re-exports the above schemas.

**Edit `packages/contracts/src/kafka/topics.ts`** — add:

```ts
BOOKING_HOLD_SEATS_REQUESTED: "booking.hold-seats-requested.v1",
INVENTORY_SEATS_HELD: "inventory.seats-held.v1",
INVENTORY_SEATS_HOLD_FAILED: "inventory.seats-hold-failed.v1",
INVENTORY_SEAT_HOLD_EXPIRED: "inventory.seat-hold-expired.v1",
BOOKING_CONFIRMED: "booking.confirmed.v1",
BOOKING_CANCELLED: "booking.cancelled.v1",
PAYMENT_ORDER_CREATED: "payment.order-created.v1",
PAYMENT_SUCCESS: "payment.success.v1",
```

**Edit `packages/contracts/src/kafka/event-types.ts`** — add matching string-literal event types (`HoldSeatsRequestedV1`, `SeatsHeldV1`, etc.).

**Edit `packages/contracts/src/kafka/consumer-groups.ts`** — add:

```ts
BOOKING_SEATS_HELD: "booking-service-seats-held-consumer",
BOOKING_SEATS_HOLD_FAILED: "booking-service-seats-hold-failed-consumer",
BOOKING_SEAT_HOLD_EXPIRED: "booking-service-seat-hold-expired-consumer",
BOOKING_PAYMENT_SUCCESS: "booking-service-payment-success-consumer",
BOOKING_SCHEDULE_CANCELLED: "booking-service-schedule-cancelled-consumer",
PAYMENT_ORDER_CREATED: "payment-service-order-created-consumer",  // for payment stub
INVENTORY_BOOKING_CONFIRMED: "inventory-service-booking-confirmed-consumer",
INVENTORY_BOOKING_CANCELLED: "inventory-service-booking-cancelled-consumer",
```

**Edit `packages/contracts/src/index.ts`** — `export * from "./booking/index.js"`.

### 1b. gRPC proto additions for the inventory service

Two RPCs to add to the existing inventory proto: **`ValidateBooking`** (a focused synchronous pre-flight called by `BookingService.createBooking`) and **`GetSeatMap`** (the seat-map screen). **The earlier per-seat `CheckAvailability` RPC is dropped from this plan** — the per-seat / per-segment availability check stays in inventory's authoritative `holdSeats` consumer where it belongs and is naturally serialized through the saga. The synchronous pre-flight only handles the **cheap invariants** that would otherwise produce a useless `Booking(PENDING) → SagaLog(HOLD_SEATS) → INVENTORY_SEATS_HOLD_FAILED(SCHEDULE_INACTIVE)` round-trip for a booking that should have been rejected up-front.

**Edit `packages/contracts/proto/irctc/inventory/v1/inventory.proto`** — add to the existing `InventoryService`:

**First RPC — `ValidateBooking` for the synchronous pre-flight in `BookingService.createBooking`:**

```proto
// ValidateBooking does a cheap synchronous schedule-level pre-flight before
// the booking flow writes any rows. It validates the (scheduleId, fromStationId,
// toStationId) tuple plus the schedule's departure timestamp. It does NOT check
// per-seat availability — that stays in the saga's holdSeats consumer where
// the authoritative segment-overlap query lives. Returned statuses are
// terminal: if non-OK, the booking controller throws ApiError and no booking
// row is created.
rpc ValidateBooking (ValidateBookingRequest) returns (ValidateBookingResponse);

message ValidateBookingRequest {
  string schedule_id      = 1;
  string from_station_id  = 2;
  string to_station_id    = 3;
  // Client clock at request time — used as the comparison baseline for
  // "train_already_departed" so the server does not need to trust the
  // caller's wall clock directly. Server still compares against its own
  // `departure_date` + a small clock-skew window (default 60s).
  google.protobuf.Timestamp client_requested_at = 4;
}

message ValidateBookingResponse {
  // OK | SCHEDULE_NOT_FOUND | SCHEDULE_INACTIVE | TRAIN_ALREADY_DEPARTED
  string status = 1;
  // When status == TRAIN_ALREADY_DEPARTED, the schedule's departure time
  // (RFC3339) — for the error message override.
  string departure_at = 2;
}
```

**Second RPC — `GetSeatMap` for the seat-map screen:**

```proto
// GetSeatMap returns the full coach layout for a schedule between two stations.
// This is what the seat-map screen renders. Only CONFIRMED allocations count
// as "booked" — held/expired/released seats show as available to the user
// because that matches real-world UX (real apps don't surface transient hold
// state to the UI). Cache-friendly: the response is large but stable per
// (schedule, segment), so clients can cache it for the session.
rpc GetSeatMap (GetSeatMapRequest) returns (GetSeatMapResponse);

message GetSeatMapRequest {
  string schedule_id = 1;
  string from_station_id = 2;
  string to_station_id = 3;
}

message GetSeatMapResponse {
  // OK | SCHEDULE_NOT_FOUND | SCHEDULE_INACTIVE
  string status = 1;
  repeated Coach coaches = 2;     // ordered by coach_number
}
message Coach {
  string coach_id = 1;
  string coach_number = 2;
  string coach_type = 3;          // SL | 3AC | 2AC | 1AC | 2S | CC | EA
  int32 total_seats = 4;
  repeated SeatMapSeat seats = 5; // ordered by seat_number
}
message SeatMapSeat {
  string seat_id = 1;
  int32 seat_number = 2;
  string seat_type = 3;           // LOWER | MIDDLE | UPPER | SIDE_LOWER | SIDE_UPPER
  string berth_type = 4;          // SEATER | SLEEPER
  string price = 5;               // decimal string
  // Only true if a CONFIRMED allocation overlaps the requested segment.
  // HELD/EXPIRED/RELEASED allocations are intentionally hidden — the user
  // can't act on them and seeing them would cause confusion.
  bool is_booked = 6;
  // Optional: surface quota constraints (LADIES, SENIOR, DISABLED). Server
  // validates this against the passenger's gender/age in handleSeatsHeld.
  string quota = 7;
}
```

Re-run the protoc generation (the script that produced the existing `packages/contracts/src/generated/irctc/inventory/v1/inventory.ts`). The generated `InventoryServiceDefinition` will now include the new RPCs.

**Edit `apps/booking-service/src/grpc/inventory.client.ts`** — the client surface picks up the new method automatically through TypeScript types, but update the import in `packages/contracts/src/index.ts` if needed (the re-export of the generated inventory service already includes all RPCs).

### 1c. gRPC proto for the payment service

**New file: `packages/contracts/proto/irctc/payment/v1/payment.proto`**

```proto
syntax = "proto3";
package irctc.payment.v1;
service PaymentService {
  rpc CreateOrder (CreateOrderRequest) returns (CreateOrderResponse);
  rpc GetOrderStatus (GetOrderStatusRequest) returns (GetOrderStatusResponse);
}
message CreateOrderRequest {
  string booking_id = 1;
  string user_id = 2;
  string amount = 3;        // decimal string
  string currency = 4;
}
message CreateOrderResponse {
  string payment_order_id = 1;
  string status = 2;
}
message GetOrderStatusRequest { string payment_order_id = 1; }
message GetOrderStatusResponse { string payment_order_id = 1; string status = 2; }
```

Generate the TS bindings. The inventory proto's generation is already wired (output is in `packages/contracts/src/generated/`); add payment to that same script (or just run the protoc command and add to the `generated/irctc/payment/v1/` path). Confirm the generation script before editing.

**Edit `packages/contracts/src/index.ts`** — also re-export the generated `PaymentServiceDefinition` and `PaymentServiceClient` from the new generated path.

---

## Step 2 — Prisma schema for booking-service

**Edit `apps/booking-service/prisma/schema.prisma`** — add models:

```prisma
enum BookingStatus {
  PENDING
  SEATS_HELD
  PAYMENT_PENDING
  CONFIRMING
  CONFIRMED
  CANCELLING
  CANCELLED
  EXPIRED
  FAILED
}

enum PassengerGender { MALE FEMALE OTHER }

enum SagaStep { HOLD_SEATS CREATE_PAYMENT CONFIRM_SEATS }

enum SagaStatus { PENDING COMPLETED FAILED COMPENSATED }

model Booking {
  id              String        @id @default(uuid())
  pnr             String        @unique
  userId          String
  scheduleId      String
  fromStationId   String
  toStationId     String
  status          BookingStatus @default(PENDING)
  totalPrice      Decimal       @default(0.0) @db.Decimal(12, 2)
  paymentOrderId  String?
  version         Int           @default(0)
  failureReason   String?
  lockExpiresAt   DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  seats           BookingSeat[]
  passengers      BookingPassenger[]
  sagaLogs        SagaLog[]

  @@index([userId, createdAt])
  @@index([status])
  @@index([paymentOrderId])
  @@map("bookings")
}

// BookingSeat is the inventory-derived record. Created at booking time with the
// seatIds the user picked, then enriched by handleSeatsHeld with the physical
// coachNumber/seatNumber/price/fromSequence/toSequence from SeatsHeldV1.allocations[].
model BookingSeat {
  id              String   @id @default(uuid())
  bookingId       String

  // Mirrors what inventory returns in SeatsHeldV1.allocations[].
  // Filled by handleSeatsHeld — these are the source of truth for the e-ticket.
  seatInventoryId String?
  seatId          String
  coachId         String?
  coachNumber     String?
  seatNumber      Int?
  seatType        String?
  berthType       String?
  fromSequence    Int?
  toSequence      Int?
  price           Decimal? @db.Decimal(12, 2)
  quota           String?  // "GENERAL" | "LADIES" | "SENIOR" | "DISABLED"

  booking    Booking          @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  passenger  BookingPassenger?

  @@index([bookingId])
  @@index([seatInventoryId])
  @@map("booking_seats")
}

// 1:1 with BookingSeat (enforced by bookingSeatId @unique). Allows a lap-infant
// passenger with bookingSeatId = null if you ever need that. Real FK means partial
// cancel can drop a BookingSeat and cascade the linked passenger in one statement.
model BookingPassenger {
  id              String          @id @default(uuid())
  bookingId       String
  bookingSeatId   String?         @unique
  fullName        String
  age             Int
  gender          PassengerGender
  berthPreference String?
  idType          String?         // "AADHAAR" | "PAN" | "PASSPORT" | "VOTER_ID" etc
  idNumber        String?

  booking    Booking      @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  seat       BookingSeat? @relation(fields: [bookingSeatId], references: [id], onDelete: Cascade)

  @@index([bookingId])
  @@map("booking_passengers")
}

model SagaLog {
  id         String     @id @default(uuid())
  bookingId  String
  step       SagaStep
  status     SagaStatus @default(PENDING)
  error      String?
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  booking    Booking    @relation(fields: [bookingId], references: [id], onDelete: Cascade)

  @@unique([bookingId, step])
  @@index([status])
  @@map("saga_logs")
}

model BookingIdempotencyKey {
  id            String   @id @default(uuid())
  idempotencyKey String  @unique
  bookingId     String
  responseBody  Json
  createdAt     DateTime @default(now())

  @@map("booking_idempotency_keys")
}
```

**Action**: run `pnpm prisma migrate dev --name add_booking_domain` from `apps/booking-service/` (and apply the same migration to the payment stub DB in Step 4).

---

## Step 3 — Booking service: infrastructure layer

### 3a. Env additions

**Edit `apps/booking-service/src/config/env.ts`** — add:

```ts
PAYMENT_GRPC_URL: z.string().default("localhost:50052"),
SEAT_HOLD_TTL_MS: z.coerce.number().int().default(300_000),       // 5 min
SEAT_LOCK_TTL_SEC: z.coerce.number().int().default(300),
BOOKING_TTL_SECONDS: z.coerce.number().int().default(600),
IDEMPOTENCY_TTL_SEC: z.coerce.number().int().default(86_400),    // 24h
BOOKING_VALIDATE_DEADLINE_MS: z.coerce.number().int().default(3000),  // gRPC pre-flight deadline
```

### 3b. Repositories

**New files** in `apps/booking-service/src/repository/`:

- `booking.repo.ts` — `findById(id, tx?)`, `create(data, tx)`, `updateStatus(id, newStatus, expectedVersion, tx)` (CAS), `updatePassengers(bookingId, passengersData, tx)`, `setPaymentOrderId(id, paymentOrderId, expectedVersion, tx)`, `setTotalPrice(id, totalPrice, expectedVersion, tx)`, `findByPnr(pnr)`, `listByUser(userId, { status, page, limit })`
- `booking-passenger.repo.ts` — bulk `create` inside the booking create call
- `saga.repo.ts` — `create(bookingId, step, status, tx)`, `update(bookingId, step, status, error?, tx)`
- `idempotency.repo.ts` — `findByKey(key, tx?)`, `create({ key, bookingId, responseBody }, tx)` (rely on unique constraint for the inner-tx re-check)

**Edit `apps/booking-service/src/repository/index.ts`** — re-export the four.

### 3c. Seat lock service

**New file: `apps/booking-service/src/services/seat-lock.service.ts`** — wraps 3 Lua scripts in Redis:

- `acquireSeatLocks(scheduleId, seatIds, token, ttlSec)` — atomic SETNX per seat; returns `true` only if all succeed, rolls back partial acquisitions
- `releaseSeatLocks(scheduleId, seatIds, token)` — Lua compare-and-delete on `booking:lock:seat:${scheduleId}:${seatId}` keys, only deletes if the value matches `token`
- `renewSeatLocks(scheduleId, seatIds, token, newTtlSec)` — Lua compare-and-expire

The token is the bookingId (UUID) so only the holder can release.

### 3d. gRPC payment client (the only sync call in the saga)

**New file: `apps/booking-service/src/grpc/payment.client.ts`** — mirrors `inventory.client.ts`. Singleton with `createGrpcClient(PaymentServiceDefinition, env.PAYMENT_GRPC_URL, { defaultTimeoutMs: 3000 })`. Exports `getPaymentGrpcClient(): PaymentServiceClient` and `closePaymentGrpcChannel(): Promise<void>` for shutdown.

**Why a gRPC client (not HTTP fetch):** the architecture rules forbid direct `nice-grpc` calls outside `@irctc/grpc` and HTTP between services. The platform already has the `@irctc/grpc` factory. The orchestrator needs the `paymentOrderId` immediately after `SEATS_HELD` to advance to `PAYMENT_PENDING`, so this is the one synchronous hop — but it goes through gRPC, not `fetch`. The reference prototype at `D:\dev\itctc-clone` used `fetch(${PAYMENT_SERVICE_URL}/api/v1/payments/orders, ...)`; we do **not** copy that pattern.

**Edit `apps/booking-service/src/grpc/index.ts`** — re-export both clients.

**Edit `apps/booking-service/src/server.ts`** — call `getPaymentGrpcClient()` alongside `getInventoryGrpcClient()` during boot; add `closePaymentGrpcChannel()` to the shutdown sequence (after consumer stop, before Kafka disconnect, per `.claude/rules/bootstrap.md`).

**Edit `apps/booking-service/src/container/booking.container.ts`** — inject `PaymentServiceClient` into the orchestrator constructor. The orchestrator becomes:

```ts
new BookingSagaOrchestrator(
  prisma,
  bookingRepository,
  sagaRepository,
  idempotencyRepository,
  paymentGrpcClient, // ← new: used by handleSeatsHeld to create the order
);
```

---

## Step 4 — Payment-service stub

**New directory: `apps/payment-service/`** — clone the layout of `apps/inventory-service/`. Files:

- `package.json` — copy from inventory-service; add `@irctc/contracts` and `@irctc/grpc` deps; add `apps/booking-service` style of Prisma + Redis + Kafka config
- `tsconfig.json` — mirror booking-service
- `prisma/schema.prisma` — `Payment` model (`id`, `paymentOrderId @unique`, `bookingId`, `userId`, `amount Decimal`, `status`, `razorpayPaymentId?`, `razorpaySignature?`, `createdAt`, `updatedAt`) + `OutboxEvent`
- `src/config/{env,prisma,redis,kafka}.ts` — mirror booking-service
- `src/grpc/payment.handler.ts` — implements `CreateOrder` (inserts a `Payment` row with status `CREATED`, writes `PaymentOrderCreatedV1` to outbox) and `GetOrderStatus`
- `src/grpc/server.ts` — `startGrpcServer(env.GRPC_PORT)` like inventory
- `src/services/payment.service.ts` — `createOrder(bookingId, userId, amount)`, `getStatus(paymentOrderId)`, with all the outbox + tx plumbing matching the inventory-service style
- `src/container/payment.container.ts` — wires repos, service, future consumers
- `src/server.ts` — full lifecycle matching inventory's `server.ts`
- `src/api/v1/routes/webhook.routes.ts` — placeholder `POST /webhook` that flips status to `CAPTURED` (no real Razorpay signature check yet — TODO comment)
- `src/consumers/` — empty for now (the stub doesn't consume anything; booking-service is the consumer of `PaymentSuccess` via its own consumer)

**Register the new service** in `turbo.json`, `pnpm-workspace.yaml` (already a glob), and `docker-compose.yml` (add a `payment-service` block with its own DB schema and a port mapping for `50052:50052` for the gRPC server, `4004:4004` for the HTTP webhook). Add a database in the `infra/` directory if docker-compose has a per-service DB.

---

## Step 5 — Booking service: REST surface (DTOs + controllers + routes)

### 5a. DTOs

**New file: `apps/booking-service/src/dto/booking.dto.ts`**

- `createBookingSchema` (Zod) — `{ idempotencyKey: uuid, scheduleId: uuid, fromStationId: uuid, toStationId: uuid, seatIds: uuid[1..6], passengers: [{ fullName: string(1..100), age: int(1..120), gender: enum(MALE|FEMALE|OTHER), berthPreference?: enum(LOWER|MIDDLE|UPPER|SIDE_LOWER|SIDE_UPPER|NO_PREFERENCE) }] }` with `.refine`:
  - `seatIds.length === passengers.length` (1:1 pairing by array index)
  - `new Set(seatIds).size === seatIds.length` (no duplicates)
  - `fromStationId !== toStationId`
- `pnrParamSchema` — `{ pnr: string(/^[A-Z0-9]{10}$/) }`
- `seatMapQuerySchema` — `{ fromStationId: uuid, toStationId: uuid }` (for the seat-map proxy)
- `cancelBookingSchema` — empty body

**Why `seatIds` is top-level, not nested in each passenger:** the UI's seat-map screen produces a list of selected seat IDs before any passenger data exists. The client state is `selectedSeatIds: string[]`. Forcing it into `passengers[].seatId` requires the client to invent empty passenger stubs on the seat-map screen and then mutate them in place — fragile. The server pairs them by array index, with a real FK link established via `BookingSeat` (see Step 2) once `handleSeatsHeld` enriches the seat rows.

**New file: `apps/booking-service/src/dto/index.ts`** — re-export.

**New file: `apps/booking-service/src/utils/errors/index.ts`** — `ERROR_CODES` const matching the plan's error code vocabulary:

- Booking-flow: `EMPTY_PASSENGERS`, `TOO_MANY_PASSENGERS`, `DUPLICATE_SEAT_IDS`, `BOOKING_NOT_FOUND`, `BOOKING_INVALID_TRANSITION`
- Pre-flight (from synchronous `ValidateBooking` gRPC): `SCHEDULE_NOT_FOUND` → 404, `SCHEDULE_INACTIVE` → 409, `TRAIN_ALREADY_DEPARTED` → 409
- Saga: `HOLD_SEATS_FAILED`, `PAYMENT_FAILED`, `CONFIRM_SEATS_FAILED`

Each pre-flight error code carries a domain-specific override message that names the `scheduleId` and (for `TRAIN_ALREADY_DEPARTED`) echoes `departure_at`. The per-seat / per-segment availability errors (`SEATS_UNAVAILABLE`, `SEGMENT_CONFLICT`, `SEAT_NOT_FOUND`) stay in the saga path inside `SeatsHoldFailedV1.reason` because that's where the authoritative segment-overlap query lives.

Plus a corresponding `ERROR_MESSAGES` map consumed by `registerErrorMessages` in `server.ts`. Each code maps to a human-readable string the global error handler surfaces.

### 5b. Controllers

**New file: `apps/booking-service/src/controllers/booking.controller.ts`**

- `create(req, res)` — pulls `req.user.userId`, calls `bookingService.createBooking(userId, req.body)`, returns 202 with `{ bookingId, pnr, status }`
- `getByPnr(req, res)` — calls `bookingService.findByPnr(req.params.pnr)`, returns 200 with the booking
- `cancel(req, res)` — pulls userId, calls `bookingService.cancelBooking(req.params.id, userId)`, returns 200

**New file: `apps/booking-service/src/controllers/seat-map.controller.ts`**

- `getSeatMap(req, res)` — pulls `req.params.scheduleId` and `req.query.fromStationId, req.query.toStationId`, calls `inventoryGrpcClient.getSeatMap(...)`, returns 200 with the coach layout. The seat-map screen calls this; the booking service is a thin proxy.

**Edit `apps/booking-service/src/controllers/index.ts`** — re-export.

### 5c. Routes

**New file: `apps/booking-service/src/api/v1/routes/booking.routes.ts`**

- `router.use(requireUser)` (from `@irctc/middleware`) on every booking route
- `POST /` → `validateSchema(createBookingSchema)`, `asyncHandler(bookingController.create)`
- `GET /pnr/:pnr` → `validateParams(pnrParamSchema)`, `asyncHandler(bookingController.getByPnr)`
- `POST /:id/cancel` → `asyncHandler(bookingController.cancel)`

**New file: `apps/booking-service/src/api/v1/routes/schedule.routes.ts`**

- `router.use(requireUser)` (must be logged in to see seat map)
- `GET /:scheduleId/seat-map?fromStationId=...&toStationId=...` → `validateQuery(seatMapQuerySchema)`, `asyncHandler(seatMapController.getSeatMap)`

**Edit `apps/booking-service/src/api/v1/routes/index.ts`** — `router.use("/bookings", bookingRoutes)` and `router.use("/schedules", scheduleRoutes)`.

---

## Step 6 — Booking service: core domain

### 6a. Booking event mapper

**New file: `apps/booking-service/src/mappers/booking-event.mapper.ts`**

- `toHoldSeatsRequestedEvent({ bookingId, scheduleId, seatIds, fromStationId, toStationId, holdTtlMs })` → Zod-parsed `HoldSeatsRequestedV1` with fresh `eventId` + `createdAt`
- `toBookingConfirmedEvent({ bookingId, scheduleId, seatInventoryIds })` → `BookingConfirmedV1`
- `toBookingCancelledEvent({ bookingId, userId, scheduleId, reason, refundAmount })` → `BookingCancelledV1`

### 6b. Booking service (orchestrator pattern: `BookingService` + `BookingSagaOrchestrator`)

The booking lifecycle is split into **two classes**, each owning one concern:

- **`BookingService`** — owns `createBooking` (the entry point), the row-level state-machine transitions (`markSeatsHeld`, `markPaymentPending`, `markConfirming`, `markConfirmed`, `markFailed`, `markExpired`, `cancelBooking`), and `findByIdForUser` / `findByPnr` reads. **It does NOT subscribe to any Kafka topics** — every transition is driven by a method call from the orchestrator or a controller.
- **`BookingSagaOrchestrator`** (already exists in `apps/booking-service/src/services/booking-saga.orchestrator.ts`) — owns the **saga state machine** and the **consumer-side handlers** (`handleSeatsHeld`, `handleSeatsHoldFailed`, `handleSeatHoldExpired`). It advances the saga by calling `BookingService.mark*` methods inside transactions, and it owns the only synchronous interservice call in the booking flow — the gRPC `payment.CreateOrder` hop that converts `SEATS_HELD → PAYMENT_PENDING`.

The `SeatsResultConsumer` (Step 6c) routes `INVENTORY_SEATS_HELD` / `INVENTORY_SEATS_HOLD_FAILED` / `INVENTORY_SEAT_HOLD_EXPIRED` to the orchestrator. `payment-success.consumer` routes `PAYMENT_SUCCESS` to `BookingService.markConfirming + markConfirmed` after the orchestrator has flipped `PAYMENT_PENDING → CONFIRMING`.

**`apps/booking-service/src/services/booking.service.ts`** (already exists; **edit it** to align with the orchestrator pattern):

Constructor injection of `prisma`, `bookingRepository`, `outboxRepository`, `seatLockService`. The `BookingIdempotencyKey` repository and the saga repository live in their own files; `BookingService.createBooking` calls `bookingIdempotencyRepository.findByKey/create` directly (it owns the HTTP-layer idempotency) and `sagaRepository.create` for the initial saga row.

Methods:

1. `createBooking(userId, dto)` — orchestrator kickoff:
   - cheap idempotency check outside tx (`bookingIdempotencyRepository.findByKey`)
   - validation already enforced by Zod `.refine` in Step 5a (passenger count 1–6, unique seatIds, length match, `fromStationId !== toStationId`)
   - **Synchronous gRPC pre-flight** — `inventoryGrpcClient.validateBooking({ scheduleId: dto.scheduleId, fromStationId: dto.fromStationId, toStationId: dto.toStationId, clientRequestedAt: new Date() })`:
     - if `status === "SCHEDULE_NOT_FOUND"` → throw `ApiError(404, ERROR_CODES.SCHEDULE_NOT_FOUND, `Schedule not found for scheduleId=${dto.scheduleId}.`)`
     - if `status === "SCHEDULE_INACTIVE"` → throw `ApiError(409, ERROR_CODES.SCHEDULE_INACTIVE, `Schedule ${dto.scheduleId} is cancelled or otherwise inactive.`)`
     - if `status === "TRAIN_ALREADY_DEPARTED"` → throw `ApiError(409, ERROR_CODES.TRAIN_ALREADY_DEPARTED, `Train for scheduleId=${dto.scheduleId} departed at ${departureAt}.`)`
     - if `status === "OK"` → proceed
     - **Wrap in `translateGrpcError(err)`** — `ClientError` (not_found, deadline_exceeded, unavailable, etc.) → throw `ApiError(503, COMMON_ERROR_CODES.SERVICE_UNAVAILABLE, `Inventory service unreachable while validating booking for scheduleId=${dto.scheduleId}.`)`. This is defense-in-depth: if inventory is down, **fail fast** rather than accept a booking that won't be honoured.
     - **Time budget**: `env.BOOKING_VALIDATE_DEADLINE_MS` (default 3000 ms, same `defaultTimeoutMs: 3000` as the existing inventory client)
   - generate `bookingId` (UUID) and `pnr` (10-char alphanumeric)
   - acquire Redis segment-aware seat locks with `bookingId` as the lock token (`seatLockService.acquireSeatLocks({ scheduleId, seatIds, lockToken: bookingId, ttlSeconds, legIndices })`)
   - open `prisma.$transaction(async tx => …)`:
     - re-check idempotency inside tx (`bookingIdempotencyRepository.findByKey(..., tx)`)
     - `bookingRepository.create({ id, pnr, userId, scheduleId, fromStationId, toStationId, status: PENDING, version: 1 }, tx)`
     - **Create `BookingSeat` rows** — one per `dto.seatIds[i]`, with just `bookingId` + `seatId` filled. The `coachNumber/seatNumber/seatType/price/fromSequence/toSequence` columns are filled later by `BookingSagaOrchestrator.handleSeatsHeld` from the `SeatsHeldV1.allocations[]` event
     - **Create `BookingPassenger` rows with FK link** — `for (let i = 0; i < dto.passengers.length; i++)` insert a passenger with `bookingId`, `bookingSeatId = seats[i].id`, and the passenger fields from `dto.passengers[i]`. 1:1 pairing by array index; FK enforced by `bookingSeatId @unique`
     - **Create initial `SagaLog` row** — `sagaRepository.create({ bookingId, step: SagaStep.HOLD_SEATS, status: SagaStatus.PENDING }, tx)`
     - **Insert outbox row for `BOOKING_HOLD_SEATS_REQUESTED`** — `outboxRepository.insert(tx, { aggregateType: "Booking", aggregateId: booking.id, eventType: EVENT_TYPES.HOLD_SEATS_REQUESTED, topic: KAFKA_TOPICS.BOOKING_HOLD_SEATS_REQUESTED, payload: holdRequestedPayload })`. The payload is built by `BookingEventMapper.toHoldSeatsRequestedEvent({ bookingId, scheduleId, seatIds, fromStationId, toStationId, holdTtlMs })` → Zod-parsed `HoldSeatsRequestedV1` with fresh `eventId` + `createdAt`
     - `bookingIdempotencyRepository.create({ idempotencyKey, bookingId, responseBody }, tx)` (catch `P2002` → re-fetch and return cached)
   - return `{ bookingId, pnr, status }` (202)
   - on tx error: `seatLockService.releaseSeatLocks(...)` in `finally`

2. `markSeatsHeld(bookingId, lockExpiresAt)` — CAS `PENDING → SEATS_HELD`, persist `lockExpiresAt`, emit `BookingStatusChangedV1` via outbox. Called by the orchestrator after the saga writes its `HOLD_SEATS: COMPLETED` row

3. `markPaymentPending(bookingId, paymentOrderId)` — CAS `SEATS_HELD → PAYMENT_PENDING`, persist `paymentOrderId`, emit `BookingStatusChangedV1` via outbox. Called by the orchestrator after the gRPC `CreateOrder` call returns the `paymentOrderId`

4. `markConfirming(bookingId)` — CAS `PAYMENT_PENDING → CONFIRMING`, emit `BookingStatusChangedV1` via outbox. Called by the orchestrator after `BookingConfirmedV1` (from inventory's `confirmSeats` consumer) lands

5. `markConfirmed(bookingId)` — CAS `CONFIRMING → CONFIRMED`, emit `BookingStatusChangedV1` via outbox. Same trigger as `markConfirming` (the orchestrator handles both transitions inside the same handler)

6. `markFailed(bookingId, reason)` — CAS `* → FAILED`, persist `failureReason`. Used by `handleSeatsHoldFailed` and the gRPC `CreateOrder` failure path in `handleSeatsHeld`

7. `markExpired(bookingId)` — CAS `* → EXPIRED`. Used by `handleSeatHoldExpired`

8. `cancelBooking(bookingId, userId)` — CAS-claim to `CANCELLING` first, then `CANCELLING → CANCELLED`. Emits `BookingStatusChangedV1` + `BookingCancelledV1` via outbox. For CONFIRMED bookings the saga also calls inventory + payment refund via Kafka events

9. `findByIdForUser(userId, bookingId)` — owner-checked read with 404/403 mapping

10. `findByPnr(pnr)` — PNR-keyed read with 404 mapping

**Edit `apps/booking-service/src/services/index.ts`** — re-export `BookingService` + `BookingSagaOrchestrator`.

### 6b-bis. Saga orchestrator (already exists; **edit it** to inject `PaymentServiceClient`)

The orchestrator class at `apps/booking-service/src/services/booking-saga.orchestrator.ts` already handles the three seat-hold reply topics. The change this plan introduces is one extra constructor dependency — `paymentGrpcClient: PaymentServiceClient` — and one extra method body in `handleSeatsHeld` to drive the gRPC `CreateOrder` call.

**Constructor:**

```ts
constructor(
  private readonly prisma: PrismaClient,
  private readonly bookingRepository: BookingRepository,
  private readonly sagaRepository: SagaRepository,
  private readonly idempotencyRepository: IdempotencyRepository,
  private readonly bookingService: BookingService,         // ← already injected, owns the mark* methods
  private readonly paymentGrpcClient: PaymentServiceClient, // ← NEW: only sync call in the saga
) {}
```

**`handleSeatsHeld(event)` (rewrite of the current body):**

The current implementation (lines 51–155 of `booking-saga.orchestrator.ts`) handles `PENDING → SEATS_HELD` and the saga `HOLD_SEATS: COMPLETED` row. It does **not** yet call payment. The new body adds the gRPC hop **after** the `SEATS_HELD` transaction commits, inside the same `try { … }` so a `CreateOrder` failure triggers the `idempotencyRepository.release(eventKey)` path:

```ts
await this.idempotencyRepository.reserveIfNew(eventKey);
// ... existing tx: enrich passengers, CAS PENDING → SEATS_HELD, set totalPrice,
//     saga HOLD_SEATS → COMPLETED, saga CREATE_PAYMENT row → PENDING
//     (everything inside prisma.$transaction)
//
// After the tx commits, run the sync gRPC hop:
let paymentOrderId: string;
try {
  const order = await this.paymentGrpcClient.createOrder({
    bookingId,
    userId: booking.userId,
    amount: totalPrice.toFixed(2),
    currency: "INR",
  });
  paymentOrderId = order.paymentOrderId;
} catch (err) {
  // CreateOrder failed — compensate: flip booking FAILED, release Redis locks,
  // mark saga CREATE_PAYMENT: FAILED, rethrow so the outer catch releases the
  // idempotency reservation and the next redelivery retries from a clean slate.
  await this.bookingService.markFailed(
    bookingId,
    `CreateOrder failed: ${(err as Error).message}`,
  );
  await this.seatLockService.releaseSeatLocks({
    scheduleId,
    seatIds,
    lockToken: bookingId,
    legIndices,
  });
  await this.sagaRepository.update(
    bookingId,
    SagaStep.CREATE_PAYMENT,
    SagaStatus.FAILED,
    errMsg,
  );
  throw err;
}

await this.bookingService.markPaymentPending(bookingId, paymentOrderId);
await this.sagaRepository.update(
  bookingId,
  SagaStep.CREATE_PAYMENT,
  SagaStatus.COMPLETED,
);
await this.idempotencyRepository.markProcessed(eventKey);
```

**Important — error semantics on `CreateOrder` failure.** The reference prototype at `D:\dev\itctc-clone` failed fast on `CreateOrder` errors. We do the same: a transient gRPC failure flips the booking to `FAILED` (terminal) and releases the Redis seat locks. The compensation is irreversible because we already committed `HOLD_SEATS: COMPLETED` and inventory has `SeatAllocation(HELD)` rows — those get released by the `INVENTORY_SEATS_RELEASED` event the orchestrator's failure path emits (Step 6c adds the `BOOKING_FAILED` outbox row + an inventory consumer that flips allocations back to `RELEASED`). The alternative (leave the booking in `SEATS_HELD` forever, wait for redelivery to retry `CreateOrder`) is what itctc-clone does, but the user has not blessed that path — match the prototype's fail-fast behaviour.

**`handleSeatsHoldFailed(event)` and `handleSeatHoldExpired(event)` are unchanged** from the existing orchestrator implementation (lines 162–282 of `booking-saga.orchestrator.ts`). They already CAS-book-flip correctly and mark the saga log.

### 6b-ter. Booking event mapper

**New file: `apps/booking-service/src/mappers/booking-event.mapper.ts`**

- `toHoldSeatsRequestedEvent({ bookingId, scheduleId, seatIds, fromStationId, toStationId, holdTtlMs })` → Zod-parsed `HoldSeatsRequestedV1` with fresh `eventId` + `createdAt`
- `toBookingConfirmedEvent({ bookingId, scheduleId, seatInventoryIds })` → `BookingConfirmedV1`
- `toBookingCancelledEvent({ bookingId, userId, scheduleId, reason, refundAmount })` → `BookingCancelledV1`

### 6c. Kafka consumers

**New files in `apps/booking-service/src/consumers/`:**

- `seats-held.consumer.ts` — subscribes to `INVENTORY_SEATS_HELD`, parses `SeatsHeldV1`, calls `bookingService.handleSeatsHeld(parsed)`, `heartbeat()` in `finally`. Mirror `apps/inventory-service/src/consumers/schedule-created.consumer.ts` exactly: catch `SyntaxError` / `ZodError` / `ApiError(4xx)` as non-retryable, re-throw anything else.
- `seats-hold-failed.consumer.ts` — same shape, calls `handleSeatsHoldFailed`
- `seat-hold-expired.consumer.ts` — same shape, calls `handleSeatHoldExpired`
- `payment-success.consumer.ts` — same shape, calls `handlePaymentSuccess`
- `schedule-cancelled.consumer.ts` — handles `INVENTORY_SCHEDULE_STATUS_CHANGED` for cancelled schedules: cancel all active bookings on that schedule (mirror `handleScheduleCancelled` in `irctc-backend/booking-service/src/services/booking.service.js:725`)

**Edit `apps/booking-service/src/consumers/index.ts`** — re-export all five.

### 6d. Container wiring

**Edit `apps/booking-service/src/container/booking.container.ts`** — fully populate:

- All four repos
- `SeatLockService` (uses `redis` from `@config`)
- `IdempotencyRepository` from `@irctc/redis` (keyspace `booking`, lease 60s, processed 24h)
- `OutboxRepository = new PostgresOutboxRepository(prisma)`
- `BookingEventMapper`
- `BookingService` (gets all of the above)
- Five `KafkaConsumerRunner`s with `RetryPolicies.conservative()`
- Five `*Consumer` instances wired to the runner + service

The `start()` method awaits `Promise.all([...consumers.start()])`. The `disconnect()` method does the same with `stop()`.

---

## Step 7 — Server lifecycle

**Edit `apps/booking-service/src/server.ts`** — in `startServer`:

- After `initKafka`, import the outbox worker (`import { OutboxWorker } from "@irctc/kafka"`) and start it as a long-lived loop alongside the consumers
- Eagerly init both gRPC clients

In `shutdown`:

- Stop outbox worker first (so no new events get queued mid-shutdown)
- Stop HTTP server
- Stop Kafka consumers
- Close gRPC client channels
- Disconnect Kafka
- Disconnect Redis
- Disconnect Prisma
- Shutdown telemetry

---

## Step 8 — Inventory-service extensions

The plan's Stages 5 and 10 require inventory to handle the new events. The existing `apps/inventory-service/` already has the proto generated and a working gRPC server. The orchestrator flow **removes the `checkAvailability` gRPC handler** (it was a pre-flight that the booking flow no longer needs); we keep `getSeatMap` for the seat-map screen and add the saga-side consumers + `SeatAllocationService` that drive the event-driven hold lifecycle.

**Edit `apps/inventory-service/src/grpc/inventory.handler.ts`** — add `validateBooking` (schedule-level pre-flight) and `getSeatMap` (seat-map screen) alongside the existing `getSeatDetails`:

```ts
// validateBooking does the cheap synchronous schedule-level pre-flight
// that BookingService.createBooking calls before writing any rows. It does
// NOT check per-seat availability — that lives in the saga's holdSeats
// consumer. It only validates:
//   - the (scheduleId) row exists
//   - the schedule is ACTIVE
//   - the (fromStationId, toStationId) tuple resolves to a (fromSeq < toSeq) segment
//   - the train hasn't already departed
async validateBooking(
  request: ValidateBookingRequest,
): Promise<ValidateBookingResponse> {
  const { scheduleId, fromStationId, toStationId } = request;

  if (!scheduleId || !fromStationId || !toStationId) {
    throw new ApiError(
      statusCode.badRequest,
      COMMON_ERROR_CODES.INVALID_INPUT,
      "scheduleId, fromStationId, and toStationId are required.",
    );
  }

  // 1. Schedule exists and is ACTIVE
  const schedule = await prisma.scheduleInventory.findUnique({
    where: { scheduleId },
    select: { status: true, departureDate: true },
  });
  if (!schedule) {
    return { status: "SCHEDULE_NOT_FOUND", departureAt: "" };
  }
  if (schedule.status !== "ACTIVE") {
    return { status: "SCHEDULE_INACTIVE", departureAt: schedule.departureDate.toISOString() };
  }

  // 2. Segment endpoints resolve to a forward segment (fromSeq < toSeq)
  const [fromStop, toStop] = await Promise.all([
    prisma.routeStop.findFirst({
      where: { scheduleId, OR: [{ stationId: fromStationId }, { stationCode: fromStationId.toUpperCase() }] },
      select: { sequenceNumber: true },
    }),
    prisma.routeStop.findFirst({
      where: { scheduleId, OR: [{ stationId: toStationId }, { stationCode: toStationId.toUpperCase() }] },
      select: { sequenceNumber: true },
    }),
  ]);
  if (!fromStop || !toStop || fromStop.sequenceNumber >= toStop.sequenceNumber) {
    return { status: "SCHEDULE_INACTIVE", departureAt: schedule.departureDate.toISOString() };
  }

  // 3. Departure check — clock-skew tolerant (60s window). "Train already
  //    departed" is defined as `status === ACTIVE && departureDate <= now()`.
  //    We do NOT extend ScheduleInventoryStatus with DEPARTED because that
  //    would need a status-flips-with-time worker for the entire schedule
  //    window. A departure time check is sufficient.
  const CLOCK_SKEW_MS = 60_000;
  if (schedule.departureDate.getTime() <= Date.now() - CLOCK_SKEW_MS) {
    return { status: "TRAIN_ALREADY_DEPARTED", departureAt: schedule.departureDate.toISOString() };
  }

  return { status: "OK", departureAt: schedule.departureDate.toISOString() };
}
```

```ts
// getSeatMap returns the full coach layout for the seat-map screen.
// Only CONFIRMED allocations show as booked — HELD/EXPIRED/RELEASED are
// intentionally hidden because that's what real-world apps do (the user
// can't act on a transient hold, and showing it would scare them).
async getSeatMap(
  request: GetSeatMapRequest,
): Promise<GetSeatMapResponse> {
  const { scheduleId, fromStationId, toStationId } = request;

  // 1. Validate schedule exists and is ACTIVE
  const schedule = await prisma.scheduleInventory.findUnique({
    where: { scheduleId },
    select: { status: true },
  });
  if (!schedule) {
    return { status: "SCHEDULE_NOT_FOUND", coaches: [] };
  }
  if (schedule.status !== "ACTIVE") {
    return { status: "SCHEDULE_INACTIVE", coaches: [] };
  }

  // 2. Look up segment endpoints (same as checkAvailability)
  const [fromStop, toStop] = await Promise.all([
    prisma.routeStop.findUnique({
      where: { scheduleId_stationId: { scheduleId, stationId: fromStationId } },
      select: { sequenceNumber: true },
    }),
    prisma.routeStop.findUnique({
      where: { scheduleId_stationId: { scheduleId, stationId: toStationId } },
      select: { sequenceNumber: true },
    }),
  ]);
  if (!fromStop || !toStop || fromStop.sequenceNumber >= toStop.sequenceNumber) {
    return { status: "SCHEDULE_INACTIVE", coaches: [] };
  }

  // 3. Load the full seat inventory for this schedule, joined with coach +
  //    seat metadata, ordered for stable rendering.
  const seatInvs = await prisma.seatInventory.findMany({
    where: { scheduleId },
    select: {
      id: true,
      seatId: true,
      coachId: true,
      coachNumber: true,
      coachType: true,
      seatNumber: true,
      seatType: true,
      berthType: true,
      price: true,
      quota: true,
    },
    orderBy: [{ coachNumber: "asc" }, { seatNumber: "asc" }],
  });

  if (seatInvs.length === 0) {
    return { status: "OK", coaches: [] };
  }

  // 4. Find all CONFIRMED allocations that overlap the requested segment.
  //    HELD/EXPIRED/RELEASED are intentionally NOT returned — the seat-map
  //    screen should look stable to the user, not flicker.
  const overlapping = await prisma.seatAllocation.findMany({
    where: {
      scheduleId,
      status: "CONFIRMED",
      fromSequence: { lt: toStop.sequenceNumber },
      toSequence:   { gt: fromStop.sequenceNumber },
    },
    select: { seatInventoryId: true },
  });
  const bookedSeatInvIds = new Set(overlapping.map((o) => o.seatInventoryId));

  // 5. Group seats by coach and shape the response.
  const byCoach = new Map<string, Coach>();
  for (const s of seatInvs) {
    const existing = byCoach.get(s.coachId);
    if (!existing) {
      byCoach.set(s.coachId, {
        coachId: s.coachId,
        coachNumber: s.coachNumber,
        coachType: s.coachType,
        totalSeats: 1,
        seats: [{
          seatId: s.seatId,
          seatNumber: s.seatNumber,
          seatType: s.seatType,
          berthType: s.berthType,
          price: s.price.toString(),
          isBooked: bookedSeatInvIds.has(s.id),
          quota: s.quota ?? "GENERAL",
        }],
      });
    } else {
      existing.totalSeats += 1;
      existing.seats.push({
        seatId: s.seatId,
        seatNumber: s.seatNumber,
        seatType: s.seatType,
        berthType: s.berthType,
        price: s.price.toString(),
        isBooked: bookedSeatInvIds.has(s.id),
        quota: s.quota ?? "GENERAL",
      });
    }
  }

  return {
    status: "OK",
    coaches: Array.from(byCoach.values()),
  };
}
```

**Notes on these handlers:**

- **No Redis lock, no row lock** on `getSeatMap` — best-effort read for a UI screen. The authoritative check happens in `holdSeats` with `SELECT ... FOR UPDATE` + Redis seat lock. Two requests 1ms apart can both get `OK` here, but only one will succeed at the hold stage.
- **`getSeatMap` only includes CONFIRMED** so the seat-map screen looks stable — HELD seats flicker as users pay or back out, which is bad UX.
- **`validateBooking` is the synchronous pre-flight** for `BookingService.createBooking`. It's cheap (one `findUnique` + two `findFirst` + a `Date.now()` comparison), bounded by `BOOKING_VALIDATE_DEADLINE_MS`, and **does NOT do per-seat work**. The per-seat / per-segment availability check stays in inventory's authoritative `holdSeats` consumer where it belongs and is naturally serialized through the saga.
- **The earlier plan's `checkAvailability` per-seat pre-flight is gone** — that was redundant with the saga's `holdSeats`. `validateBooking` replaces it for the **schedule-level** invariants only.

**New file: `apps/inventory-service/src/consumers/hold-seats.consumer.ts`**

- Subscribes to `BOOKING_HOLD_SEATS_REQUESTED`
- Parses `HoldSeatsRequestedV1`
- Calls `seatAllocationService.holdSeats(event)` (new method, see below)
- DLQ via `wrapWithDlq` (already exists in `@irctc/kafka`)

**New file: `apps/inventory-service/src/consumers/booking-confirmed.consumer.ts`**

- Subscribes to `BOOKING_CONFIRMED`
- Parses `BookingConfirmedV1`
- Calls `seatAllocationService.confirmSeats(event)` — bulk `updateMany` from HELD → CONFIRMED for the booking's allocations, write history rows, outbox `INVENTORY_SEATS_CONFIRMED` (new topic — add to contracts)

**New file: `apps/inventory-service/src/consumers/booking-cancelled.consumer.ts`**

- Subscribes to `BOOKING_CANCELLED`
- Marks allocations RELEASED, history, outbox `INVENTORY_SEATS_RELEASED`

**New file: `apps/inventory-service/src/workers/hold-expiry.worker.ts`**

- Polls every 30s, finds `SeatAllocation` rows with `status = HELD AND holdExpiresAt < now()`, flips to EXPIRED, writes history, outbox `INVENTORY_SEAT_HOLD_EXPIRED`

**New file: `apps/inventory-service/src/services/seat-allocation.service.ts`** — core saga handler:

- `holdSeats(event)` — full per-stage logic from the plan's Stage 5: validate schedule/seats, sort, `SELECT ... FOR UPDATE` on seat rows, segment-overlap check, bulk insert HELD allocations with `fromSequence/toSequence` and computed `price = pricePerKm * (toStop.distanceFromStart - fromStop.distanceFromStart)`, write `SeatAllocationHistory`, outbox `SeatsHeldV1` with full allocation data; on any failure publish `SeatsHoldFailedV1` with the right reason
- `confirmSeats(event)` — bulk update HELD → CONFIRMED
- `cancelSeats(event)` — bulk update HELD|CONFIRMED → RELEASED

This is the largest single file. The algorithm matches the plan's Stage 5 verbatim, but coded against the existing `prisma` model and the `SeatInventory` table already in `apps/inventory-service/prisma/schema.prisma`. Note: the plan references a `SeatAllocation` table that **does not yet exist in this schema** — add it to `apps/inventory-service/prisma/schema.prisma`:

```prisma
model SeatAllocation {
  id              String   @id @default(uuid())
  bookingId       String
  scheduleId      String
  seatInventoryId String
  fromSequence    Int
  toSequence      Int
  status          String   // HELD | CONFIRMED | RELEASED | EXPIRED
  price           Decimal  @db.Decimal(12, 2)
  holdExpiresAt   DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  seatInventory   SeatInventory @relation(fields: [seatInventoryId], references: [id])
  @@index([bookingId])
  @@index([scheduleId, status])
  @@index([status, holdExpiresAt])
  @@map("seat_allocations")
}
model SeatAllocationHistory {
  id              String   @id @default(uuid())
  seatAllocationId String
  fromStatus      String
  toStatus        String
  reason          String
  createdAt       DateTime @default(now())
  @@index([seatAllocationId])
  @@map("seat_allocation_history")
}
```

**Edit `apps/inventory-service/src/container/inventory.container.ts`** — instantiate `SeatAllocationService`, the three new consumers, and the hold-expiry worker. Add them to `start()` / `disconnect()`.

---

## Step 9 — Verification

End-to-end smoke test (manual):

1. **Boot infra**: from `D:\dev\distributed_railway_booking_platform\`, run `pnpm docker:compose:up` (or the project's standard infra command). Verify Postgres, Redis, Kafka are up.

2. **Run migrations**:
   - `cd apps/booking-service && pnpm prisma migrate deploy`
   - `cd apps/payment-service && pnpm prisma migrate deploy`
   - `cd apps/inventory-service && pnpm prisma migrate deploy` (includes new `SeatAllocation` tables)

3. **Seed test data** (re-use or extend the existing admin-service seed if present, otherwise hand-craft):
   - A `ScheduleInventory` row (active, with `version=1`) referenced from a `ScheduleCreated` event
   - Several `SeatInventory` rows under that schedule
   - A user record (so we can mint a JWT cookie)

4. **Start services in order** (each in its own terminal):
   - `pnpm --filter inventory-service dev` — verify `/health/ready` returns 200, gRPC server bound on `:50051`
   - `pnpm --filter payment-service dev` — verify gRPC server on `:50052`
   - `pnpm --filter booking-service dev` — verify gRPC client connects, outbox worker starts, all 5 consumers subscribe

5. **Happy path test** (use a REST client like Bruno/Insomnia or curl):
   - `POST /api/v1/bookings` with a real JWT cookie, an `idempotencyKey` UUID, `scheduleId`, `fromStationId`, `toStationId`, `seatIds: [uuid, uuid]`, and one passenger object per seat (1:1 by index)
   - Expect 202 with `{ bookingId, pnr, status: "PENDING" }`
   - Tail the booking-service logs: should see "PENDING → SEATS_HELD" then "PAYMENT_PENDING" as the SeatsHeld and synchronous CreateOrder events land
   - Query `GET /api/v1/bookings/pnr/<pnr>` after a few seconds — should show `status: "PAYMENT_PENDING"`, a `paymentOrderId`, and the response should include `seats[]` with `coachNumber/seatNumber/price` populated (enriched by `handleSeatsHeld`) and `seats[].passenger` populated (the linked passenger)
   - Hit the payment-service webhook stub: `POST /api/v1/webhook` with a fake `razorpay_signature` (no real verification yet) — see booking move to `CONFIRMED`
   - Query PNR again — should show `status: "CONFIRMED"`

6. **Idempotency test**: re-`POST` the same booking with the same `idempotencyKey` — should return the original response, no new row.

7. **Concurrency test**: open two parallel `POST /bookings` requests for the same seats on the same schedule — one wins (PENDING), one gets 409 `SEATS_ALREADY_LOCKED`.

7a. **Redis seat-lock test (replaces the dropped `CheckAvailability` pre-flight)**: directly assert the segment-aware Lua lock by inspecting Redis keys + attempting conflicting bookings:

- After a successful `POST /bookings`, run `redis-cli KEYS "booking:lock:seat:<scheduleId>:*"` — every `(scheduleId, seatId, fromSeq, toSeq)` tuple in the booking should be present, value = `bookingId`. Same set keyed `inv:lock:seat:<scheduleId>:*` should be present **transiently** during `holdSeats` execution (released in `finally`)
- Send a second `POST /bookings` for the **same seats** + **same segment** while the first booking is still in `PENDING` → second request returns 409 `BOOKING_INVALID_TRANSITION` ("One or more selected seats are currently locked by another transaction.")
- Send a second `POST /bookings` for the **same seats** + **non-overlapping segment** (e.g. first is A→B with fromSeq=1 toSeq=2; second is C→D with fromSeq=3 toSeq=4) → both succeed because the segment-aware keys are disjoint (Appendix A.4)
- Stop Redis, retry `POST /bookings` → 503 from the gateway (`INTERNAL_ERROR`), the booking row is never created, no Redis lock leaked
- **Note**: this is the new authoritative pre-flight. The earlier plan's `CheckAvailability` gRPC is gone — Redis segment-aware locking + inventory's authoritative `holdSeats` transaction cover the same races.

7b. **GetSeatMap test (seat-map screen)**: call `GET /api/v1/schedules/:scheduleId/seat-map?fromStationId=...&toStationId=...` (or hit inventory gRPC directly):

- With no CONFIRMED allocations → expect `status: "OK"`, every seat in every coach with `is_booked: false`. All seats clickable in the UI.
- After one booking completes (CONFIRMED) for a single seat on the requested segment → that seat returns `is_booked: true`, all others `false`. Other HELD seats on the same segment should still show `is_booked: false` (intentional — the user can't act on holds).
- With a CANCELLED schedule → expect `status: "SCHEDULE_INACTIVE"`, `coaches: []`.
- Then open the UI, render the seat map, and verify the booked seat is rendered with a grey fill + cross icon, all other seats are slate, and clicking the booked seat does nothing. Then `POST /bookings` for two of the unbooked seats + 2 passengers → expect 202.

7c. **FK integrity test** (run via direct DB access, not through the API):

- Try `INSERT INTO booking_passengers (booking_id, booking_seat_id, full_name, age, gender) VALUES (..., 'non-existent-seat-uuid', ...)` — expect foreign-key violation.
- Try creating two `BookingPassenger` rows pointing at the same `bookingSeatId` — expect unique constraint violation.
- After a successful booking, `SELECT b.pnr, s.coach_number, s.seat_number, p.full_name FROM bookings b JOIN booking_seats s ON s.booking_id = b.id LEFT JOIN booking_passengers p ON p.booking_seat_id = s.id WHERE b.pnr = '<pnr>'` — every seat should have exactly one passenger (or NULL for lap-infant).

8. **Failure paths** (each can be triggered by toggling a fault):
   - Stop inventory-service → `POST /bookings` returns 503 `SERVICE_UNAVAILABLE` from the `validateBooking` gRPC pre-flight (the `translateGrpcError` path in Step 6b). No booking row is created, no Redis lock is acquired, no outbox row, no Kafka event. This is the desired fast-fail behavior.
   - Mark a `ScheduleInventory` row `CANCELLED` → `POST /bookings` returns 409 `SCHEDULE_INACTIVE` synchronously from the gRPC pre-flight. No booking row.
   - Set `ScheduleInventory.departureDate` to a past timestamp → `POST /bookings` returns 409 `TRAIN_ALREADY_DEPARTED` synchronously. The error message includes the actual `departure_at` from `ScheduleInventory.departureDate`.
   - `POST /bookings` with a non-existent `scheduleId` → 404 `SCHEDULE_NOT_FOUND` synchronously. No booking row.
   - `POST /bookings` with the same seats + same scheduleId that already had a booking rejected by the saga (e.g. `SEATS_UNAVAILABLE` from `INVENTORY_SEATS_HOLD_FAILED`) → 202 PENDING, then FAILED through the saga path (the per-seat / per-segment conflict stays in the saga; `validateBooking` doesn't filter it).
   - Stop payment-service → `validateBooking` returns OK, Redis lock acquires, `Booking(PENDING) + SagaLog(HOLD_SEATS) + OutboxEvent(HoldSeatsRequested)` writes succeed (Kafka is unaffected), inventory consumes, allocates, emits `INVENTORY_SEATS_HELD`. The orchestrator's `handleSeatsHeld` then calls the gRPC `CreateOrder` against a stopped payment-service, the call hits `BOOKING_VALIDATE_DEADLINE_MS` (different env var: the gRPC client's default 3s), `paymentGrpcClient.createOrder` throws, orchestrator's failure-compensation branch runs `BookingService.markFailed(reason)` + Redis seat-lock release + saga `CREATE_PAYMENT: FAILED`. Verify via direct DB.
   - Cancel a CONFIRMED booking via `POST /api/v1/bookings/:id/cancel` — should flip to CANCELLED, emit `BookingCancelledV1`, eventually inventory releases the allocations.

8a. **ValidateBooking pre-flight tests** (via grpcurl):

- Unknown schedule UUID → `status: "SCHEDULE_NOT_FOUND"`, no DB inserts
- Cancelled schedule → `status: "SCHEDULE_INACTIVE"`, no DB inserts
- `fromStationId` / `toStationId` where `fromSequence >= toSequence` → `status: "SCHEDULE_INACTIVE"`, no DB inserts
- Departure time in the past (minus 60s clock-skew) → `status: "TRAIN_ALREADY_DEPARTED"` with `departure_at` populated
- Happy path (ACTIVE schedule, forward segment, future departure) → `status: "OK"` with `departure_at` populated
- Inventory gRPC server down → booking-service's `translateGrpcError` maps the `ClientError(unavailable)` to `ApiError(503, COMMON_ERROR_CODES.SERVICE_UNAVAILABLE, ...)` and throws synchronously
- `POST /bookings` after each terminal `validateBooking` status → expect the matching HTTP status (404 / 409 / 409) with the correct `code` field; no `Booking` row, no `BookingIdempotencyKey` row, no `SagaLog` row, no `OutboxEvent` row (verify via direct DB queries)

9. **Verify Kafka topics** with `kafka-console-consumer`:
   - `booking.hold-seats-requested.v1`, `inventory.seats-held.v1`, `inventory.seats-hold-failed.v1`, `payment.success.v1`, `booking.confirmed.v1` — should see the round trip.

10. **Check the outbox table**:
    - `SELECT * FROM outbox_events WHERE aggregate_id = '<bookingId>' ORDER BY created_at` — should show the lifecycle: HoldSeatsRequested → (later) BookingConfirmed (or BookingCancelled, or FAILED with no downstream events)

---

## Files to create / edit (summary)

**New files (booking-service):**

- `prisma/migrations/.../add_booking_domain/migration.sql`
- `src/dto/booking.dto.ts`, `src/dto/index.ts`
- `src/utils/errors/index.ts`
- `src/repository/{booking,booking-passenger,saga,idempotency}.repo.ts`
- `src/services/booking.service.ts`, `src/services/seat-lock.service.ts`
- `src/mappers/booking-event.mapper.ts`
- `src/grpc/payment.client.ts`
- `src/controllers/booking.controller.ts`
- `src/api/v1/routes/booking.routes.ts`
- `src/consumers/{seats-held,seats-hold-failed,seat-hold-expired,payment-success,schedule-cancelled}.consumer.ts`

**Edited files (booking-service):**

- `prisma/schema.prisma`
- `src/config/env.ts`
- `src/server.ts`
- `src/app.ts` (mount the booking router on `/api/v1/bookings`)
- `src/repository/index.ts`, `src/services/index.ts`, `src/controllers/index.ts`, `src/grpc/index.ts`, `src/api/v1/routes/index.ts`, `src/consumers/index.ts`, `src/container/booking.container.ts`

**New files (payment-service stub):** all listed in Step 4.

**Edited files (inventory-service):**

- `prisma/schema.prisma` (add `SeatAllocation`, `SeatAllocationHistory`)
- `src/services/seat-allocation.service.ts` (new)
- `src/grpc/inventory.handler.ts` (add `validateBooking` synchronous pre-flight + `getSeatMap` method — **no `checkAvailability`**)
- `src/consumers/{hold-seats,booking-confirmed,booking-cancelled}.consumer.ts` (new)
- `src/workers/hold-expiry.worker.ts` (new)
- `src/container/inventory.container.ts` (wire new service + consumers + worker)

**New files (contracts):**

- `packages/contracts/src/booking/booking-events.v1.ts`, `packages/contracts/src/booking/index.ts`
- `packages/contracts/proto/irctc/payment/v1/payment.proto`
- `packages/contracts/src/generated/irctc/payment/v1/payment.ts` (generated)

**Edited files (contracts):**

- `packages/contracts/proto/irctc/inventory/v1/inventory.proto` (add `ValidateBooking` synchronous pre-flight + `GetSeatMap` RPC — **no `CheckAvailability`**)
- `packages/contracts/src/kafka/{topics,event-types,consumer-groups}.ts`
- `packages/contracts/src/index.ts`

**Repo config:** add `payment-service` to `turbo.json`, `docker-compose.yml`, `infra/` per-service DB.

---

---

## Appendix A — Saga orchestrator + dual-side Redis Lua seat-lock (this is now the plan, not a recommendation)

The Stages above are now written assuming the **saga orchestrator pattern is the design** (not an optional appendix). The reference prototype at `D:\dev\itctc-clone\apps\booking-service\src\services\booking-saga.orchestrator.ts` is the inspiration, but the distributed platform's orchestrator is its own implementation (`apps/booking-service/src/services/booking-saga.orchestrator.ts` — already present and used for `handleSeatsHeld` / `handleSeatsHoldFailed` / `handleSeatHoldExpired`). This appendix spells out the **current architecture** and the **dual-side Redis Lua decision** that protects the segment-aware seat allocation.

### A.1 — What `BookingSagaOrchestrator` owns (already exists, edit-only)

The orchestrator at `apps/booking-service/src/services/booking-saga.orchestrator.ts` has three consumer-side handlers. Each one **delegates row-level state transitions to `BookingService`**, owns the saga-step log writes, and (for `handleSeatsHeld`) drives the **only synchronous interservice hop in the flow** — a gRPC `payment.CreateOrder` call:

- `handleSeatsHeld(event: SeatsHeldV1Type): Promise<void>` — advances the saga `HOLD_SEATS → CREATE_PAYMENT`. Inside `prisma.$transaction`: enrich passengers from `event.allocations[]`, CAS `PENDING → SEATS_HELD` via `BookingService.markSeatsHeld`, persist `totalPrice` + `lockExpiresAt`, saga `HOLD_SEATS → COMPLETED`. **After the tx commits**, calls `paymentGrpcClient.createOrder(...)` (gRPC, via `@irctc/grpc`'s `createGrpcClient(PaymentServiceDefinition, ...)`). On `CreateOrder` failure: `BookingService.markFailed`, release Redis seat locks, saga `CREATE_PAYMENT: FAILED`, rethrow. On success: `BookingService.markPaymentPending(paymentOrderId)`, saga `CREATE_PAYMENT: COMPLETED`.
- `handleSeatsHoldFailed(event: SeatsHoldFailedV1Type): Promise<void>` — `BookingService.markFailed`, saga `HOLD_SEATS: FAILED`, release Redis seat locks.
- `handleSeatHoldExpired(event: SeatHoldExpiredV1Type): Promise<void>` — `BookingService.markExpired`, saga `HOLD_SEATS: COMPENSATED`, release Redis seat locks.

`handlePaymentSuccess` lives in the orchestrator too (it owns `BookingService.markConfirming + markConfirmed`, both inside one `prisma.$transaction`). The `payment-success.consumer` routes `PAYMENT_SUCCESS` straight to the orchestrator; the orchestrator then drives `PAYMENT_PENDING → CONFIRMING → CONFIRMED` and emits the `BookingConfirmedV1` outbox row so inventory can confirm the seats.

The orchestrator is wired in `BookingContainer` with these dependencies (the new gRPC client is the only addition vs. the existing code):

```ts
new BookingSagaOrchestrator(
  prisma,
  bookingRepository,
  sagaRepository,
  idempotencyRepository, // Redis two-phase
  bookingService, // for mark* calls
  paymentGrpcClient, // ← the one sync interservice call
);
```

### A.2 — What `BookingService` owns (already exists, edit-only)

1. `createBooking` is the orchestrator kickoff: HTTP idempotency check → Redis segment-aware seat lock (with `bookingId` as the token) → `prisma.$transaction` that writes `Booking` (PENDING), `BookingSeat` rows (raw `seatId` only, the rest enriched later from `SeatsHeldV1.allocations[]`), `BookingPassenger` rows with FK link, the initial `SagaLog(HOLD_SEATS, PENDING)` row, and the `OutboxEvent` for `BOOKING_HOLD_SEATS_REQUESTED`. Idempotency key persisted. Tx failure → `seatLockService.releaseSeatLocks(...)` in `finally`.
2. The row-level state transitions `markSeatsHeld`, `markPaymentPending`, `markConfirming`, `markConfirmed`, `markFailed`, `markExpired`, `cancelBooking` each funnel through `bookingRepository.updateStatus` (CAS) and emit `BookingStatusChangedV1` via outbox.
3. After every successful CAS transition, the SSE broadcaster (Phase 2) forwards the new status to subscribed browsers via Redis pub/sub. **The broadcaster does not change** — it's a downstream observer of the same outbox row.

### A.3 — Prerequisites that already exist

- `SagaStep` / `SagaStatus` enums + `SagaLog` model — added in Step 2 of the main plan above (`@@unique([bookingId, step])`, indexed on `status`).
- `SagaRepository`: `create(bookingId, step, status, tx)`, `update(bookingId, step, status, error?, tx)`.
- `SeatLockService`: three methods — `acquireSeatLocks`, `releaseSeatLocks`, `renewSeatLocks` — wrapping the three booking-side Lua scripts. The existing implementation in `apps/booking-service/src/services/seat-lock.service.ts` already takes the segment dimension into account via the `legIndices` parameter.
- `BookingSagaOrchestrator` and `BookingService` already wired in `BookingContainer`.

### A.4 — Dual-side Redis Lua seat-lock

Both services carry their own copies of `seat-lock.lua` / `seat-unlock.lua` under `apps/<service>/src/lua/`, and `booking-service` additionally has `seat-renew.lua`. The two locks serve different purposes and complement each other; they are not shared:

| Side                | Scripts                                              | Lifetime                                | Purpose                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booking-service`   | `seat-lock.lua`, `seat-unlock.lua`, `seat-renew.lua` | `SEAT_HOLD_TTL_MS` ≈ 10 min (saga life) | Saga-scoped "I'm working on this booking" lock. Released when the booking transitions out of the lock-sensitive state (CONFIRMED, CANCELLED, EXPIRED, FAILED) or on error.                                                          |
| `inventory-service` | `seat-lock.lua`, `seat-unlock.lua`                   | ~10–30 s                                | Short critical-section lock inside `SeatAllocationService.holdSeats` around the Prisma transaction, so two concurrent consumers (e.g. a redelivery racing a fresh delivery) can't both try to write the same `SeatAllocation` rows. |

**Why both:** the booking-side lock prevents a second `createBooking` from racing on the same `(seatId, segment)` while a saga is in flight. The inventory-side lock prevents a Kafka redelivery of `HoldSeatsRequestedV1` from racing with a fresh delivery inside the inventory `holdSeats` critical section. They protect different invariants at different layers.

**Why Lua, not normal Redis commands:** each script protects an invariant that a multi-RTT client loop cannot:

- `seat-lock.lua` — all-or-nothing multi-key `SETNX`. If any key fails, the script rolls back the keys it already set and returns `0`. A non-atomic loop can lock seats 1–3, fail on seat 4, and leave a partial hold that blocks other customers.
- `seat-unlock.lua` — ownership-checked `DEL`. Iterates keys and only deletes those whose value equals the caller's `lockToken`. Without it, a process whose TTL expired could `DEL` a key another customer now owns.
- `seat-renew.lua` (booking side only) — verify token before `EXPIRE`. Prevents a stale process from extending a lock it no longer holds.

**Source files for the scripts** (copy from `D:\dev\itctc-clone/apps/<service>/src/lua/` and adjust the key builder — see "Key shape" below):

- `apps/booking-service/src/lua/seat-lock.lua`, `seat-unlock.lua`, `seat-renew.lua`
- `apps/inventory-service/src/lua/seat-lock.lua`, `seat-unlock.lua`
- Optional `apps/<service>/src/lua/index.ts` barrel so the service can `import { seatLockLua } from "@lua"` (only if your tsconfig already has a `@lua/*` alias)

#### Key shape — segment-aware (corrected for this project)

itctc-clone's keys (`{scheduleId}:{seatId}` on booking, `{scheduleId}:{seatInventoryId}` on inventory) are **correct only for full-run booking** — a seat is held for the entire schedule. This project supports **segment bookings** (A→B while another passenger holds A→D), and the `SeatAllocation` uniqueness constraint is on `(scheduleId, seatInventoryId, fromSequence, toSequence)`. The Lua key must mirror that constraint so Redis rejections and DB rejections line up; otherwise we get false conflicts (over-locking of non-overlapping legs) or false pass-throughs (Redis says OK, the DB unique constraint fails late).

- Booking side: `booking:lock:seat:{scheduleId}:{seatId}:{fromSeq}:{toSeq}` — one key per leg-range the booking covers. For a multi-leg booking, emit one key per leg sequence index.
- Inventory side: `inv:lock:seat:{scheduleId}:{seatInventoryId}:{fromSeq}:{toSeq}` — same segment dimension, inventory's view of the row.

The `fromSequence` / `toSequence` come from `RouteStop.sequenceNumber` for the passenger's `fromStationId` / `toStationId` — already available to `SeatLockService` because Step 1a of the main plan reserves them in `HoldSeatsRequestedV1` and Step 5a's DTO carries `legIndices` / `fromSequence` / `toSequence`. **Don't accept leg-less bookings** at the route-validation layer either; if any of `fromSequence` / `toSequence` is missing, throw `INVALID_INPUT` at the Zod layer (`.refine`) rather than silently falling back to a seat-only key.

The Lua scripts themselves (`seat-lock.lua`, `seat-unlock.lua`, `seat-renew.lua`) **do not change** — they iterate whatever `KEYS` they're given. The change is entirely in the JS-side key builder. The lock value (the ownership token) stays the `bookingId` UUID.

Why both seat dimension **and** segment dimension:

- Same seat, non-overlapping legs (A→B vs C→D) → different keys → both succeed. (Lock per-leg.)
- Same seat, overlapping legs (A→B vs A→C) → same key collision → second fails fast.
- Same seat, identical legs → same key collision → second fails fast.
- Same segment, different seats → different keys → both succeed. (Lock per-seat.)

A seat-only key (itctc-clone's current shape) collapses the first two cases into one collision, so the second passenger sees `SEAT_ALREADY_HELD` even though no real overlap exists — exactly the false-positive storm segment-aware booking has to avoid.

The Lua scripts stay duplicated per service (don't move them to `@irctc/redis` as a package); itctc-clone deliberately keeps them duplicated because the TTL and key shape differ between services.

### A.5 — Inventory-side changes that go with A.4

Step 8 of the main plan already adds `SeatAllocationService` in `apps/inventory-service\src\services\seat-allocation.service.ts`. With the dual-side lock decision in A.4, that service must:

1. Take the inventory-side lock **segment-aware** — key shape is `inv:lock:seat:{scheduleId}:{seatInventoryId}:{fromSequence}:{toSequence}`. The keys are derived from the `HoldSeatsRequestedV1` event (it carries `fromStationId` / `toStationId`, which the service maps to `fromSequence` / `toSequence` via `RouteStop`). The lock is taken **after** seat validation but **before** the `SELECT ... FOR UPDATE` + bulk-insert section.
2. Release the same segment-aware keys in `finally` (success or failure).
3. Treat `acquired === false` as `SeatsHoldFailedV1` with reason `SEAT_ALREADY_HELD` (not an exception — the booking saga already saw `BOOKING_INVALID_TRANSITION` on the booking side and will reach the same conclusion via the matching Redis key).

Do **not** add `renewSeatLocks` on the inventory side — the critical section is short enough that the lock TTL (≥ 10 s) covers the worst case without renewal.

**No `CheckAvailability` to keep in sync** — the booking flow does not have a gRPC pre-flight (Step 1b dropped it). The Redis segment-aware key on the booking side is the only authoritative gate, and the inventory-side Lua lock agrees with it because both keys are segment-aware. False positives are impossible because the keys are disjoint for disjoint segments.

### A.6 — Verification (incremental)

1. Unit-test the orchestrator class by mocking `SagaRepository` + `paymentGrpcClient` and asserting that the saga-step log transitions match `{HOLD_SEATS → CREATE_PAYMENT → CONFIRM_SEATS}`. Mirror the asserts in `D:\dev\itctc-clone\apps\booking-service`'s own orchestrator tests if present.
2. End-to-end happy path: `POST /api/v1/bookings` → row PENDING, saga log `HOLD_SEATS/PENDING`, outbox row for `BOOKING_HOLD_SEATS_REQUESTED`. Inventory consumer processes → `SeatAllocation/HELD`, outbox for `INVENTORY_SEATS_HELD`. Booking consumer `SeatsHeldV1` → orchestrator advances saga, booking reaches `SEATS_HELD` then `PAYMENT_PENDING` after the gRPC `CreateOrder` returns the `paymentOrderId`.
3. **gRPC `CreateOrder` failure path**: stop payment-service, fire a fresh booking. Expect: row PENDING → SEATS_HELD, then orchestrator catches `CreateOrder` failure → `BookingService.markFailed(reason)` + Redis seat-lock release + saga `CREATE_PAYMENT: FAILED`. Verify via direct DB: `bookings.status = FAILED`, `saga_logs` has `CREATE_PAYMENT/FAILED`. Restart payment-service, replay the `SeatsHeldV1` Kafka message → orchestrator's idempotency key is released (the outer `try { … } catch { idempotencyRepository.release(eventKey) }` path), retry from a clean state, and the booking stays FAILED (terminal). Manual replay requires a manual offset reset because Kafka consumer offsets already advanced; production replay goes through a re-deliver admin endpoint.
4. Hold-expiry: artificially set `holdExpiresAt` past → `HoldExpiryWorker` flips allocations to `EXPIRED`, `INVENTORY_SEAT_HOLD_EXPIRED` emitted → booking `EXPIRED`.
5. Two-side lock check (segment-aware): with `redis-cli`, inspect booking-side key `booking:lock:seat:<scheduleId>:<seatId>:<fromSeq>:<toSeq>` while a saga holds it; send a second `createBooking` for the same seat AND same leg → second request fails with `BOOKING_INVALID_TRANSITION` at the Redis step. Simultaneously inspect inventory-side key `inv:lock:seat:<scheduleId>:<seatInventoryId>:<fromSeq>:<toSeq>` during `holdSeats` execution.
6. Segment-non-overlap test (regression check): with the segment-aware key, two `createBooking` requests for the **same seat** but **non-overlapping legs** (e.g. A→B and C→D where B < C) both succeed and produce two separate `SeatAllocation` rows on disjoint `(fromSequence, toSequence)` ranges. With the old seat-only key, the second request fails — that's the false-positive case segment-aware booking explicitly fixes.
7. SSE unchanged: open `GET /api/v1/bookings/<id>/events` and confirm that `BookingStatusChangedV1` events for the orchestrator-driven transitions (`PENDING → SEATS_HELD → PAYMENT_PENDING → CONFIRMING → CONFIRMED`) are forwarded in order. The broadcaster does not need to know about the orchestrator — it's a downstream observer of the same outbox row.
8. Idempotency: replay `SeatsHeldV1` after the saga step is `COMPLETED` → orchestrator's CAS guard prevents double-write. Same for `BookingConfirmedV1` / `SeatHoldExpiredV1` / `PaymentSuccessV1`.

### A.7 — Files to add / edit for the orchestrator + Lua

**New files (booking-service):**

- `apps/booking-service/src/lua/seat-lock.lua` — booking-side acquire (copy from `D:\dev\itctc-clone\apps\booking-service\src\lua\seat-lock.lua`)
- `apps/booking-service/src/lua/seat-unlock.lua` — booking-side release
- `apps/booking-service/src/lua/seat-renew.lua` — booking-side renew
- (optional) `apps/booking-service/src/lua/index.ts` barrel

**New files (inventory-service):**

- `apps/inventory-service/src/services/seat-lock.service.ts` — wrap `redis.eval(...)` for the two inventory-side scripts
- `apps/inventory-service/src/lua/seat-lock.lua` — inventory-side acquire (copy from `D:\dev\itctc-clone\apps\inventory-service\src\lua\seat-lock.lua`)
- `apps/inventory-service/src/lua/seat-unlock.lua` — inventory-side release
- (optional) `apps/inventory-service/src/lua/index.ts` barrel

**Edited files:**

- `apps/booking-service/src/services/booking-saga.orchestrator.ts` — inject `PaymentServiceClient` + `BookingService` deps; add the post-tx gRPC `CreateOrder` hop + failure-compensation branch in `handleSeatsHeld`
- `apps/booking-service/src/services/booking.service.ts` — extend `createBooking` to also write the `SagaLog(HOLD_SEATS, PENDING)` row + the `BOOKING_HOLD_SEATS_REQUESTED` outbox row inside the existing tx (the `BookingService` already in place does NOT yet write these two rows — Step 6b adds them)
- `apps/booking-service/src/services/index.ts` — re-export `BookingSagaOrchestrator` (already done)
- `apps/booking-service/src/container/booking.container.ts` — instantiate `paymentGrpcClient` + inject into the orchestrator constructor
- `apps/inventory-service/src/services/seat-allocation.service.ts` — take/release the inventory-side lock in `holdSeats`; treat `acquired === false` as `SeatsHoldFailedV1`
- `apps/inventory-service/src/container/inventory.container.ts` — wire `SeatLockService`
- Both services' `tsconfig.json` paths blocks: add `"@lua": ["./src/lua/index.js"]` if you adopted the barrel

---

## Open questions / TODOs during implementation

1. **Auth**: how does the booking service verify the JWT cookie? The existing middleware is in `@irctc/middleware` (`auth.ts`). If that middleware currently only works for gateway-coordinated flows, the booking service may need to import the same JWT verification logic directly. Confirm by reading `packages/middleware/src/auth.ts` before wiring `requireUser` in `booking.routes.ts`.

2. **Outbox worker**: `@irctc/kafka` exports an `OutboxWorker` (per `outbox-worker.ts`). Confirm its constructor signature before wiring in `server.ts`. The inventory service currently does NOT have an outbox worker (because the events it writes — `INVENTORY_SCHEDULE_PROJECTED` — are observed by search-service; check whether search-service has the worker). For booking, the worker MUST be running in the booking process because that's where the outbox rows live.

3. **Real gRPC generation**: confirm the protoc command for the new payment proto. The inventory proto at `packages/contracts/proto/irctc/inventory/v1/inventory.proto` was generated into `packages/contracts/src/generated/irctc/inventory/v1/inventory.ts`; the build script is likely in `packages/contracts/package.json` or a `Makefile`. Add the payment proto to the same script.

4. **Per-service DB**: docker-compose probably already provisions one Postgres per service. Verify; if it doesn't, add one for `payment-service`.

5. **Test user JWT**: the verification flow needs a valid `accessToken` cookie. The user-service's login endpoint or a dev-only "mint a token" CLI command can provide one. Add to the verification script.
