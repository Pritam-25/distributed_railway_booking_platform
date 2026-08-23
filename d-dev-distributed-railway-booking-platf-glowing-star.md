# Seat-Map HTTP Endpoint — Implementation Plan

## Context

The `BOOKING_IMPLEMENTATION.md` plan places a thin seat-map HTTP proxy inside `booking-service` (a `seat-map.controller.ts` calling `inventoryClient.getSeatMap(...)`), gated behind `requireUser`. The user has correctly questioned that design: the seat-map is the screen **before** the user logs in. It needs to render large-but-stable coach layout + a live booked-seat overlay for a (schedule, fromStation, toStation) tuple. Putting that read on the **command-side** `booking-service` mixes transactional write paths with a high-traffic read screen, and `requireUser` at this layer breaks the pre-login conversion funnel.

The right home is **`search-service`**. It already owns the read side of the platform — Kafka projection of stations/trains into Elasticsearch, Redis cache-aside, `auth: "none"` public routes. The coach structure (`train_schedules.coaches[]`) is already projected there. The remaining slice (per-seat live availability) lives in `inventory-service`, which is reached via gRPC. The seat-map screen is therefore a small composition in search-service: an **optional ES pre-check** for a clearer 404 + a **mandatory inventory gRPC `GetSeatMap` call** for the seat grid, both wrapped in a Redis cache-aside with a 60s TTL.

`CheckAvailability` (the per-seat per-segment pre-flight) is **dropped** in `BOOKING_IMPLEMENTATION.md`. A **narrow synchronous gRPC pre-flight, `inventory.ValidateBooking`**, replaces it for the schedule-level cheap invariants only — `SCHEDULE_NOT_FOUND`, `SCHEDULE_INACTIVE`, `TRAIN_ALREADY_DEPARTED`. The per-seat / per-segment availability check stays in inventory's authoritative `holdSeats` consumer where it belongs. The seat-map screen and the booking POST are decoupled; the per-seat authoritative check on the POST path is the inventory-side `holdSeats` consumer. (See `BOOKING_IMPLEMENTATION.md` Step 1b for the rationale.)

## Decisions

| Question                                                                       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Which service owns the seat-map endpoint?                                      | **`search-service`** (new endpoint, new gRPC client, new DTOs/service/controller/route)                                                                                                                                                                                                                                                                                                                                                    |
| Why not booking-service?                                                       | Wrong ownership (read vs. write), pre-login funnel blocked by `requireUser`, splits the read path                                                                                                                                                                                                                                                                                                                                          |
| Why not inventory-service directly?                                            | Inventory-service is gRPC-only; no HTTP server, no auth/rate-limit/Redis stack                                                                                                                                                                                                                                                                                                                                                             |
| Keep `CheckAvailability` (per-seat per-segment pre-flight) in `createBooking`? | **No** — `BOOKING_IMPLEMENTATION.md` removes it. The Redis segment-aware seat-lock + inventory's `holdSeats` consumer covers the per-seat / per-segment races                                                                                                                                                                                                                                                                              |
| Auth level?                                                                    | **`auth: "none"`** at the gateway (matches existing `/api/v1/search/*`)                                                                                                                                                                                                                                                                                                                                                                    |
| Caching strategy?                                                              | Redis cache-aside, 60s TTL, versioned key, **fail-open** (best-effort like existing train-search cache)                                                                                                                                                                                                                                                                                                                                    |
| Cache invalidation?                                                            | TTL for the MVP (Phase 1). **Phase 3** adds SSE-driven invalidation that pushes `{type:"SEAT_MAP_INVALIDATED"}` to subscribed browsers within ~500ms of `BookingConfirmed` / `BookingCancelled`                                                                                                                                                                                                                                            |
| New api-gateway upstream?                                                      | No — reuse `SEARCH_UPSTREAM` (the `/api/v1/search` prefix already routes to search-service)                                                                                                                                                                                                                                                                                                                                                |
| Real-time updates (booking progress)?                                          | **Phase 2** — SSE endpoint in `booking-service` pushes `BookingStatusChangedV1` deltas to the user's open tab. Unidirectional server→client, native `EventSource` on the browser                                                                                                                                                                                                                                                           |
| Real-time updates (seat-map)?                                                  | **Phase 3** — SSE endpoint in `search-service` pushes `{type:"SEAT_MAP_INVALIDATED"}` so the browser refetches the cached seat-map. Tiny event, full payload only on refetch                                                                                                                                                                                                                                                               |
| WebSocket instead of SSE?                                                      | **No** — communication requirement is one-way (server → browser). WebSocket would adopt a bidirectional protocol for half the use case. SSE survives HTTP proxies, reuses existing Express middleware (auth, request-id), and is dramatically simpler                                                                                                                                                                                      |
| SSE transport (not per-connection Kafka consumers)?                            | **One Kafka consumer per service** → **Redis pub/sub** → **N SSE connections**. Don't create one Kafka consumer per browser                                                                                                                                                                                                                                                                                                                |
| What happens to the seat-map proxy in `BOOKING_IMPLEMENTATION.md`?             | **Dropped entirely** — replaced by the search-service endpoint, no `requireUser`                                                                                                                                                                                                                                                                                                                                                           |
| Booking ↔ payment communication?                                               | **gRPC `payment.CreateOrder`** — the only sync interservice hop **beyond the pre-flight**. The architecture rules forbid HTTP `fetch` between services. The reference prototype at `D:\dev\itctc-clone` used `fetch`; the distributed platform uses `@irctc/grpc`'s `createGrpcClient(PaymentServiceDefinition, ...)` instead                                                                                                              |
| Booking ↔ inventory pre-flight communication?                                  | **gRPC `inventory.ValidateBooking`** — synchronous, schedule-level only (`SCHEDULE_NOT_FOUND`, `SCHEDULE_INACTIVE`, `TRAIN_ALREADY_DEPARTED`), called once at the top of `BookingService.createBooking`. If non-OK, `createBooking` throws `ApiError` synchronously and **no booking row is created**. Catches the obvious "schedule-level" failures fast. The per-seat / per-segment check stays in inventory's `holdSeats` saga consumer |

## Data Flow

```
GET /api/v1/search/schedules/:scheduleId/seat-map?fromStationId=...&toStationId=...
   │
   ▼
api-gateway (auth: "none", rate-limit: default)
   │
   ▼
search-service → SearchController.getSeatMap
   │
   ▼
SeatMapService.getSeatMap(scheduleId, fromStationId, toStationId)
   │
   ├─► Redis GET cache:seat-map:v1:<hash> ──── hit ─► return
   │
   └─► miss
       ├─► (optional) TrainSearchRepository.existsByScheduleId(scheduleId) — fast 404
       └─► InventoryGrpcClient.getSeatMap({scheduleId, fromStationId, toStationId})
            │
            ▼
       inventory-service → InventoryHandler.getSeatMap
            │
            ├─► ScheduleInventory.findUnique(scheduleId) — ACTIVE check
            ├─► RouteStop.findUnique(scheduleId, fromStationId) + (scheduleId, toStationId) — sequence endpoints
            ├─► SeatInventory.findMany(scheduleId) — ordered by coach, seat
            ├─► SeatAllocation.findMany({scheduleId, status: "CONFIRMED", fromSequence<toSeq, toSequence>fromSeq})
            └─► Group by coach → GetSeatMapResponse{status, coaches[]}
       │
       ▼
   Redis SET cache:seat-map:v1:<hash> (TTL 60s)
   return SeatMapResponseDto
```

## New Infrastructure (independent of endpoint location)

### Proto edit — `packages/contracts/proto/irctc/inventory/v1/inventory.proto`

Add `GetSeatMap` RPC + 4 messages alongside the existing `GetSeatDetails`. **Do not add `CheckAvailability` here** — that RPC was used by the booking flow's pre-flight, which has been removed in `BOOKING_IMPLEMENTATION.md` Step 1b. The Redis segment-aware seat-lock in `BookingService.createBooking` plus inventory's `holdSeats` consumer is the gate. The proto only needs `GetSeatMap` (the seat-map screen reads) plus the future booking-flow RPCs that come from inventory's own consumer work (`ConfirmSeats`, `ReleaseSeats`, etc., which are Kafka events, not gRPC methods — see Step 8 of `BOOKING_IMPLEMENTATION.md`).

```proto
service InventoryService {
  rpc GetSeatDetails (GetSeatDetailsRequest) returns (GetSeatDetailsResponse);
  rpc GetSeatMap     (GetSeatMapRequest)     returns (GetSeatMapResponse);
  // No CheckAvailability RPC. The booking flow's pre-flight moved to
  // Redis seat-lock + the holdSeats Kafka consumer (see BOOKING_IMPLEMENTATION.md
  // Step 1b). The proto stays minimal — every RPC here is a real caller.
}

message GetSeatMapRequest {
  string schedule_id      = 1;
  string from_station_id  = 2;
  string to_station_id    = 3;
}
message GetSeatMapResponse {
  // OK | SCHEDULE_NOT_FOUND | SCHEDULE_INACTIVE
  string status = 1;
  repeated Coach coaches = 2;
}
message Coach {
  string coach_id      = 1;
  string coach_number  = 2;
  string coach_type    = 3;          // SL | 3AC | 2AC | 1AC | 2S | CC | EA
  int32  total_seats   = 4;
  repeated SeatMapSeat seats = 5;    // ordered by seat_number
}
message SeatMapSeat {
  string  seat_id     = 1;
  int32   seat_number = 2;
  string  seat_type   = 3;           // LOWER | MIDDLE | UPPER | SIDE_LOWER | SIDE_UPPER
  string  berth_type  = 4;           // SEATER | SLEEPER
  string  price       = 5;           // decimal string
  bool    is_booked   = 6;           // true iff CONFIRMED allocation overlaps the segment
  string  quota       = 7;           // GENERAL | LADIES | SENIOR | DISABLED
}
```

### Regenerate TS bindings

Run the codegen script that produced `packages/contracts/src/generated/irctc/inventory/v1/inventory.ts`. Per the architecture rules, do not hand-edit the generated file. New types (`GetSeatMapRequest`, `GetSeatMapResponse`, `Coach`, `SeatMapSeat`, `InventoryServiceClient.getSeatMap`) appear automatically.

### Inventory handler — `apps/inventory-service/src/grpc/inventory.handler.ts`

Add `getSeatMap` alongside `getSeatDetails`:

1. `ScheduleInventory.findUnique({where:{scheduleId}, select:{status:true}})` — return `SCHEDULE_NOT_FOUND` if null, `SCHEDULE_INACTIVE` if `status !== "ACTIVE"`
2. `RouteStop.findUnique` for both `(scheduleId, fromStationId)` and `(scheduleId, toStationId)` to get `sequenceNumber`. If either is null or `fromSequence >= toSequence`, return `SCHEDULE_INACTIVE`
3. `SeatInventory.findMany({where:{scheduleId}, orderBy:[{coachNumber:"asc"},{seatNumber:"asc"}]})` selecting `id, seatId, coachId, coachNumber, seatNumber, seatType, pricePerKm`
4. `SeatAllocation.findMany({where:{scheduleId, status:"CONFIRMED", fromSequence:{lt:toSequence}, toSequence:{gt:fromSequence}}, select:{seatInventoryId:true}})` → `bookedIds = new Set(...)`. **Only CONFIRMED** — HELD/EXPIRED/RELEASED intentionally hidden for stable UI
5. Group seats by `coachId`, building `Coach { coachId, coachNumber, coachType, totalSeats, seats[] }` with `SeatMapSeat { seatId, seatNumber, seatType, berthType:"SEATER"*, price:pricePerKm.toString(), isBooked, quota:"GENERAL"* }`
6. Return `{ status: "OK", coaches: [...] }`

The `*` fields fall back to constants (`"SEATER"`, `"GENERAL"`, `"SL"`) because the columns don't yet exist on `SeatInventory`. This is documented in the follow-ups; the seat-map still renders correctly.

**Degraded path:** if the `SeatAllocation` table from `BOOKING_IMPLEMENTATION.md` Step 8 hasn't migrated yet, step 4 returns no rows → no `isBooked: true` seats, coach layout still renders. The handler doesn't crash.

The handler uses `prisma` directly here (it already does — known drift per the grpc-service skill). The next refactor can route it through `SeatAllocationRepository`; out of scope for this plan.

## Files to Create

### 1. `apps/search service/src/grpc/inventory.client.ts`

Singleton gRPC client wrapper. Mirror `apps/booking-service/src/grpc/inventory.client.ts`:

- `getInventoryGrpcClient(): InventoryServiceClient` — lazy-connects via `createGrpcClient(InventoryServiceDefinition, env.INVENTORY_GRPC_URL, {defaultTimeoutMs: 3000})`, logs `"Inventory gRPC client connected"` on first call
- `closeInventoryGrpcChannel(): Promise<void>` — closes the channel and resets singleton state

Use the `@irctc/grpc` factories — direct `nice-grpc` calls in services are forbidden by the architecture rules.

### 2. `apps/search service/src/grpc/index.ts`

```ts
export * from "./inventory.client.js";
```

### 3. `apps/search service/src/dto/seat-map.dto.ts`

Zod schemas with `.openapi(...)` metadata:

- `seatMapParamsSchema` — `{ scheduleId: z.uuid() }`
- `seatMapQuerySchema` — `{ fromStationId: z.uuid(), toStationId: z.uuid() }` with `.refine(q => q.fromStationId !== q.toStationId, {message:"fromStationId and toStationId must be different.", path:["toStationId"]})`
- `seatMapSeatSchema` — `{ seatId, seatNumber:int, seatType, berthType, price, isBooked, quota }`
- `seatMapCoachSchema` — `{ coachId, coachNumber, coachType, totalSeats:int, seats:[seatMapSeatSchema] }`
- `seatMapResponseSchema` — `{ status: enum("OK","SCHEDULE_NOT_FOUND","SCHEDULE_INACTIVE"), coaches:[seatMapCoachSchema] }`

Export inferred `SeatMapParamsDto`, `SeatMapQueryDto`, `SeatMapResponseDto`, `SeatMapCoachDto`, `SeatMapSeatDto`.

### 4. `apps/search service/src/services/seat-map.service.ts`

`SeatMapService` class — constructor injects `InventoryServiceClient`, `TrainSearchRepository`, `Redis`. Method `getSeatMap(params, query): Promise<SeatMapResponseDto>`:

- `cacheKey = ${env.SEAT_MAP_CACHE_KEY_PREFIX}:v1:${sha1(scheduleId|fromStationId|toStationId).slice(0,16)}`
- `tryReadCache(key)` — swallow Redis errors, log warn, return `null` on miss/failure
- Optional ES pre-check via `trainRepository.existsByScheduleId(scheduleId)` — if ES is down, log warn and fall through to the gRPC call
- `inventoryClient.getSeatMap({scheduleId, fromStationId, toStationId})` — translate `ClientError` from `@irctc/grpc` to `ApiError` with `COMMON_ERROR_CODES.INTERNAL_ERROR`
- Map `status: "SCHEDULE_NOT_FOUND"` → `ApiError(404, COMMON_ERROR_CODES.NOT_FOUND, "Schedule not found for scheduleId=...")`
- Map `status: "SCHEDULE_INACTIVE"` → `ApiError(409, COMMON_ERROR_CODES.CONFLICT, "Schedule ... is not active.")`
- Translate gRPC response to `SeatMapResponseDto`, `tryWriteCache(key, response, ttl)` (best-effort)
- `translateGrpcError(err)` private helper — `ClientError` → `ApiError(INTERNAL_ERROR)`; everything else re-thrown

## Files to Edit

| Path                                                               | Reason                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/proto/irctc/inventory/v1/inventory.proto`      | Add `GetSeatMap` RPC + `Coach` + `SeatMapSeat` messages (proto edit, then regen)                                                                                                                                                                           |
| `packages/contracts/src/generated/irctc/inventory/v1/inventory.ts` | Regenerate via buf codegen (do not hand-edit)                                                                                                                                                                                                              |
| `apps/inventory-service/src/grpc/inventory.handler.ts`             | Implement `getSeatMap`                                                                                                                                                                                                                                     |
| `apps/search service/src/config/env.ts`                            | Add `SEAT_MAP_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(60)`, `SEAT_MAP_CACHE_KEY_PREFIX: z.string().default("cache:seat-map")`                                                                                                            |
| `apps/search service/src/dto/index.ts`                             | `export * from "./seat-map.dto.js"`                                                                                                                                                                                                                        |
| `apps/search service/src/services/index.ts`                        | `export * from "./seat-map.service.js"`                                                                                                                                                                                                                    |
| `apps/search service/src/controllers/search.controller.ts`         | Add `getSeatMap(req, res)` method; inject `seatMapService: SeatMapService`                                                                                                                                                                                 |
| `apps/search service/src/api/v1/routes/search.routes.ts`           | Add `router.get("/schedules/:scheduleId/seat-map", validateParams(seatMapParamsSchema), validateQuery(seatMapQuerySchema), asyncHandler(...))`                                                                                                             |
| `apps/search service/src/container/search.container.ts`            | Add `public readonly seatMapService: SeatMapService` + `public readonly inventoryGrpcClient: InventoryServiceClient`; instantiate in constructor; pass `seatMapService` into `SearchController`                                                            |
| `apps/search service/src/health/dependencies.ts`                   | Add `inventoryGrpc` readiness probe using `getSeatDetails` with a sentinel UUID (fast `NOT_FOUND` is success); wrap in `Promise.race` with 5s timeout per `.claude/rules/bootstrap.md`                                                                     |
| `apps/booking-service/src/services/booking.service.ts`             | **No change for the seat-map plan** — `CheckAvailability` was removed in `BOOKING_IMPLEMENTATION.md` Step 1b; `createBooking` now goes straight to Redis segment-aware seat-lock + outbox `BOOKING_HOLD_SEATS_REQUESTED`. No seat-map HTTP code added here |
| `apps/booking-service/src/api/v1/routes/index.ts`                  | **No change** — no seat-map route to remove (the BOOKING_IMPLEMENTATION.md plan never landed the file)                                                                                                                                                     |
| `apps/booking-service/src/controllers/index.ts`                    | **No change** — no `seat-map.controller.ts` exists to remove                                                                                                                                                                                               |

## Auth

**Public** (`auth: "none"` at the api-gateway). Matches the existing `/api/v1/search/*` family in `apps/api-gateway/src/config/routes.ts`. The seat-map is a pre-login screen — `requireUser` here breaks the conversion funnel.

Rate limit: `'default'` preset (same as the existing search routes). The seat-map response is large (potentially 100–200 KB for a 700-seat Rajdhani), but the existing `express.json({limit:"1mb"})` in `createApp` is sufficient.

## Caching

| Property     | Value                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------- |
| Key shape    | `${SEAT_MAP_CACHE_KEY_PREFIX}:v1:${sha1(scheduleId\|fromStationId\|toStationId).slice(0,16)}` |
| TTL          | 60s default, env-overridable                                                                  |
| Invalidation | TTL only (matches existing `TRAIN_SEARCH_CACHE_TTL_SECONDS` strategy)                         |
| Failure mode | Fail-open — `tryReadCache` / `tryWriteCache` swallow Redis errors, log warn                   |
| Versioning   | `:v1:` prefix allows future shape bumps without code-deploy race                              |

**Why no event-driven invalidation in Phase 1:** the seat-map coach structure is fixed per schedule; only the booked-seat overlay is mutable on `BookingConfirmed`/`BookingCancelled` events. The 60s TTL is acceptable for the MVP because correctness is preserved by `CheckAvailability` + `HoldSeats` in booking-service. **Phase 3** replaces the TTL-only strategy with SSE-driven invalidation: when `BookingConfirmed` lands, the booking-service emits a `seat-map-invalidated:<scheduleId>` Redis pub/sub message; the search-service SSE handler forwards `{type:"SEAT_MAP_INVALIDATED", scheduleId}` to subscribed browsers; the browser calls `invalidateQueries(["seat-map", scheduleId])` and refetches via the existing REST endpoint. Worst-case staleness drops from 60s to sub-second.

## api-gateway

**No change required.** The existing `/api/v1/search` block in `apps/api-gateway/src/config/routes.ts` already sends the entire prefix to `SEARCH_UPSTREAM`. The new `GET /api/v1/search/schedules/:scheduleId/seat-map` is just another route under that prefix.

Optional: add `methods: ["GET"]` to the existing block for explicit method control.

## Verification

End-to-end smoke test from a fully-bootstrapped dev environment:

1. **Type-check** — `pnpm -r check-types` (verify proto regen + new code compiles)
2. **Boot order**:
   - `pnpm --filter inventory-service dev` — `/health/ready` returns 200, gRPC binds on `:50051`
   - `pnpm --filter search service dev` — `/health/ready` returns 200, log shows "Inventory gRPC client connected"
   - `pnpm --filter api-gateway dev` — `/health/ready` returns 200
3. **Cold cache seat-map** — `curl http://localhost:4000/api/v1/search/schedules/<scheduleId>/seat-map?fromStationId=<uuid>&toStationId=<uuid>` → 200 with `{status:"OK", coaches:[...]}` and every seat `isBooked:false`
4. **Cache hit** — re-issue same request → latency drops to single-digit ms; `redis-cli GET cache:seat-map:v1:<hash>` returns the payload
5. **Booked-seat overlay** — publish a `BookingConfirmed` event into inventory's consumer (or run the booking-service happy-path) to flip one seat to `CONFIRMED`; wait 60s; re-curl → that seat `isBooked:true`, HELD seats still `isBooked:false`
6. **Unknown schedule** — `curl .../<non-existent-uuid>/seat-map?...` → 404 with `code:"NOT_FOUND"`
7. **Same from/to station** — `curl ...?fromStationId=X&toStationId=X` → 400 from Zod `.refine`
8. **Inactive schedule** — mark a `ScheduleInventory` row `CANCELLED` directly in DB, retry → 409 with `code:"CONFLICT"`
9. **gRPC server down** — stop inventory-service, retry → 500 with `INTERNAL_ERROR` and `inventoryGrpc` health probe flips to `ok:false`
10. **Auth** — call without `accessToken` cookie → 200 (route is `auth:"none"`); forged `Authorization` header is stripped by `scrubOnlyMiddleware`
11. **Cache invalidation** — `redis-cli DEL cache:seat-map:v1:<hash>` → next curl is a cold miss and re-warms
12. **Booking flow regression check** — `POST /api/v1/bookings` does **not** call `CheckAvailability` any more (removed in `BOOKING_IMPLEMENTATION.md` Step 1b). Instead it goes through the synchronous `inventory.ValidateBooking` gRPC pre-flight, then to Redis segment-aware seat-lock. The regression assertions for this plan: (a) `CheckAvailability` is **not** present in the inventory proto, (b) `BookingService.createBooking` calls `validateBooking` once before the Redis lock and only proceeds on `status: "OK"`, (c) the booking POST for taken seats still returns 409 from the saga's `SEATS_UNAVAILABLE` path (the pre-flight does not check per-seat), (d) the booking POST for an UNKNOWN schedule returns 404 from the pre-flight, no `Booking` row created.

### Phase 2 — SSE booking status

13. **Open SSE stream** — `curl -N http://localhost:4000/api/v1/bookings/<bookingId>/events -H "Cookie: accessToken=<jwt>"` → 200 with `Content-Type: text/event-stream`, connection stays open, first frame is a `connected` heartbeat within 1s
14. **Trigger a transition** — POST `/api/v1/bookings` for a new booking in another terminal; within 2s the open SSE stream should receive `event: booking.status_changed\ndata: {"bookingId":"...","status":"PENDING"}\n\n` followed by `SEATS_HELD`, `PAYMENT_PENDING`, `CONFIRMED` as the saga progresses
15. **Reconnection** — kill the SSE client mid-flight, restart with `curl -N ...`; native `EventSource` retry semantics should auto-reconnect (use the browser to test, not curl)
16. **Auth** — open the stream without a cookie → 401 from the gateway's `gatewayAuthMiddleware` (route auth level is `"required"`)
17. **Unknown booking** — `curl -N .../api/v1/bookings/<non-existent-uuid>/events` → 404; valid bookingId for a booking that isn't yours → 403 (the SSE handler must verify `booking.userId === req.user.userId`)

### Phase 3 — SSE seat-map invalidation

18. **Open SSE stream** — `curl -N http://localhost:4000/api/v1/search/schedules/<scheduleId>/seat-map/events?fromStationId=<uuid>&toStationId=<uuid>` → 200 with `text/event-stream`, no auth required (matches the REST endpoint)
19. **Trigger a booking** — POST `/api/v1/bookings` on a seat in the schedule; within 1–2s the open SSE stream should receive `event: seat_map_invalidated\ndata: {"type":"SEAT_MAP_INVALIDATED","scheduleId":"..."}\n\n`
20. **Browser refetch** — in a browser with the seat-map page open, watch the SSE event land; React Query's `invalidateQueries(["seat-map", scheduleId])` fires, the GET refetches, the booked seat flips to `isBooked:true` in under 2s total (compared to up to 60s with TTL-only)
21. **Cancellation** — POST `/api/v1/bookings/<id>/cancel` on a CONFIRMED booking → SSE stream receives the same `SEAT_MAP_INVALIDATED` event → seat-map refetch shows the seat back to `isBooked:false`
22. **Cache invalidation on the server side** — at the moment the SSE event is sent, the search-service should also `redis.del(cache:seat-map:v1:<hash>)` for the affected (scheduleId, fromStationId, toStationId) tuples, so the next browser-side refetch is a cold miss and re-warms with fresh data (the browser never sees stale data even on the next refetch)

## Sequencing

### Phase 1 — REST seat-map (MVP)

```
1. Prisma migration (SeatAllocation)            [if not yet done — from BOOKING_IMPLEMENTATION.md Step 8]
2. Edit inventory.proto + buf generate           (contracts package)
3. Implement getSeatMap in inventory-service     (handler only — handler still uses prisma directly per current drift)
4. Create inventory.client.ts + grpc barrel in search-service
5. Create seat-map.dto.ts + barrel re-export
6. Create SeatMapService
7. Add getSeatMap to SearchController + route + container wiring
8. Add inventoryGrpc health probe + SEAT_MAP_CACHE_* env
9. pnpm -r check-types / lint / build
10. Smoke test end-to-end
```

Steps 2–8 don't depend on the `SeatAllocation` migration landing first — the handler degrades gracefully (no `isBooked:true` seats until the table exists). Step 1 can ship independently with the rest of `BOOKING_IMPLEMENTATION.md`.

### Phase 2 — SSE booking status (next iteration)

```
11. Add BookingStatusChangedV1 event to @irctc/contracts (topics.ts, event-types.ts)
    + booking-status-changed consumer group to consumer-groups.ts
12. BookingService: emit BookingStatusChangedV1 on every CAS transition
    (PENDING → SEATS_HELD, SEATS_HELD → PAYMENT_PENDING, PAYMENT_PENDING → CONFIRMING → CONFIRMED,
     CANCELLING → CANCELLED, plus FAILED/EXPIRED)
13. New file: apps/booking-service/src/sse/booking-event-broadcaster.ts
    — single Kafka consumer that subscribes to BOOKING_STATUS_CHANGED
    — on each event, PUBLISHES to Redis pub/sub channel
      `booking:status:<bookingId>` with the event payload
14. New file: apps/booking-service/src/sse/booking-events.controller.ts
    — GET /api/v1/bookings/:bookingId/events (Content-Type: text/event-stream)
    — verifies req.user.userId owns the booking
    — subscribes the response to Redis pub/sub channel `booking:status:<bookingId>`
    — initial heartbeat `: connected\n\n` then forward every pub/sub message
      as `event: booking.status_changed\ndata: <json>\n\n`
    — cleans up subscription on `req.on("close")` + Redis client disconnect
15. New file: apps/booking-service/src/sse/booking-events.routes.ts
    — router.use(requireUser) at the route level (gateway auth:"required")
16. Mount in apps/booking-service/src/api/v1/routes/index.ts
17. Wire Kafka consumer + Redis subscriber + route into booking container
18. api-gateway: add new prefix `/api/v1/bookings/<id>/events` with auth:"required"
    OR add to existing booking upstream block once it exists (no separate upstream needed)
19. pnpm -r check-types / lint / build
20. Smoke test (verification steps 13–17)
```

### Phase 3 — SSE seat-map invalidation

```
21. Search-service: add BookingConfirmedV1 + BookingCancelledV1 consumers
    (they already exist for the inventory consumer side — reuse the same
    event names, add CONSUMER_GROUPS.SEARCH_SEAT_MAP_INVALIDATED)
22. New file: apps/search-service/src/sse/seat-map-invalidator.ts
    — single Kafka consumer subscribed to BOOKING_CONFIRMED + BOOKING_CANCELLED
    — on each event, PUBLISHES to Redis pub/sub channel
      `seat-map:invalidated:<scheduleId>` with `{type:"SEAT_MAP_INVALIDATED", scheduleId}`
    — DEL any cached seat-map keys for that schedule (best-effort: SCAN + DEL
      `cache:seat-map:v1:*<scheduleId-hash>*` is cheap since scheduleId is in the key material)
23. New file: apps/search-service/src/sse/seat-map-events.controller.ts
    — GET /api/v1/search/schedules/:scheduleId/seat-map/events
    — auth: "none" (matches the REST endpoint)
    — subscribes the response to Redis pub/sub channel `seat-map:invalidated:<scheduleId>`
    — forwards every pub/sub message as
      `event: seat_map_invalidated\ndata: {"type":"SEAT_MAP_INVALIDATED","scheduleId":"..."}\n\n`
24. New file: apps/search-service/src/sse/seat-map-events.routes.ts
25. Mount in apps/search-service/src/api/v1/routes/index.ts (no change to routes.ts;
    the new route fits under the existing `/api/v1/search` prefix)
26. Wire consumer + Redis subscriber + route into search container
27. Browser side: react-query's invalidateQueries(["seat-map", scheduleId]) on SSE event
28. pnpm -r check-types / lint / build
29. Smoke test (verification steps 18–22)
```

**Transport architecture (both phases):** one Kafka consumer per service → Redis pub/sub → N SSE connections. Don't create one Kafka consumer per browser connection — that's a fan-out explosion that the brokers can't sustain.

## Phase 2 — SSE booking status (real-time PNR)

### Why SSE, not WebSocket

The browser doesn't need to send arbitrary messages through a persistent connection to learn about a booking it just created. It already told the server by `POST /api/v1/bookings`. After that, the browser simply needs to **listen**.

```
Browser ──────── POST /api/v1/bookings ────────> booking-service
        │
        │  (booking-service emits BookingStatusChangedV1 on each CAS transition)
        │
Browser <──── event: booking.status_changed ────── booking-service SSE
        │     data: {"bookingId":"...","status":"SEATS_HELD"}
        │
Browser <──── event: booking.status_changed ────── booking-service SSE
              data: {"bookingId":"...","status":"PAYMENT_PENDING"}
```

Communication is **server → browser only**. That's SSE territory. WebSocket would be adopting a bidirectional protocol for half the use case.

### Transport architecture

```
                  Kafka topic: BOOKING_STATUS_CHANGED
                              │
                              ▼
                  booking-service SSE consumer (1 instance)
                              │
                              │  on each event
                              ▼
                  Redis pub/sub: booking:status:<bookingId>
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
          SSE conn A    SSE conn B    SSE conn C
          (Browser)     (Browser)     (Browser)
```

**One Kafka consumer per service → Redis pub/sub → N SSE connections.** Creating one Kafka consumer per browser connection is a fan-out explosion the brokers can't sustain.

### New event — `BookingStatusChangedV1`

Edit `packages/contracts/src/booking/booking-events.v1.ts`:

```ts
BookingStatusChangedV1 = {
  eventId,
  bookingId,
  userId,
  previousStatus: BookingStatus,
  currentStatus: BookingStatus,
  pnr,
  createdAt,
};
```

Edit `packages/contracts/src/kafka/topics.ts`:

```ts
BOOKING_STATUS_CHANGED: "booking.status-changed.v1",
```

Edit `packages/contracts/src/kafka/event-types.ts`:

```ts
BOOKING_STATUS_CHANGED: "BookingStatusChangedV1",
```

Edit `packages/contracts/src/kafka/consumer-groups.ts`:

```ts
BOOKING_STATUS_BROADCAST: "booking-service-status-broadcast-consumer",
```

### Emit on every CAS transition

Edit `apps/booking-service/src/services/booking.service.ts`. Every `bookingRepository.updateStatus(...)` call inside a transaction is followed by `outboxRepository.insert(tx, { topic: TOPICS.BOOKING_STATUS_CHANGED, eventType: EVENT_TYPES.BOOKING_STATUS_CHANGED, payload })`. Transitions to cover:

- PENDING → SEATS_HELD (`handleSeatsHeld`)
- SEATS_HELD → PAYMENT_PENDING (`handleSeatsHeld` after `createOrder` succeeds)
- PAYMENT_PENDING → CONFIRMING (`handlePaymentSuccess`)
- CONFIRMING → CONFIRMED (`handlePaymentSuccess`)
- - → FAILED (`handleSeatsHoldFailed`, `handlePaymentSuccess` error path)
- - → EXPIRED (`handleSeatHoldExpired`)
- - → CANCELLING → CANCELLED (`cancelBooking`)

### SSE consumer — `apps/booking-service/src/sse/booking-event-broadcaster.ts`

Single Kafka consumer subscribed to `BOOKING_STATUS_CHANGED`, consumer-group `BOOKING_STATUS_BROADCAST`. On each parsed event:

```ts
await redis.publish(`booking:status:${event.bookingId}`, JSON.stringify(event));
```

Wrap in try/catch — Redis publish failures are logged and swallowed (the booking saga itself is already committed; missing an SSE notification is degraded UX, not a correctness issue).

### SSE controller — `apps/booking-service/src/sse/booking-events.controller.ts`

```ts
import type { Request, Response } from "express";
import type Redis from "ioredis";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";

export class BookingEventsController {
  constructor(
    private readonly redis: Redis,
    private readonly bookingRepository: BookingRepository,
  ) {}

  async stream(req: Request, res: Response): Promise<void> {
    const { bookingId } = req.params;
    const userId = req.user?.userId;

    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        `Booking not found for bookingId=${bookingId}.`,
      );
    }
    if (booking.userId !== userId) {
      throw new ApiError(
        statusCode.forbidden,
        COMMON_ERROR_CODES.FORBIDDEN,
        `Booking ${bookingId} does not belong to this user.`,
      );
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    // Initial heartbeat so the browser's EventSource flips to OPEN
    res.write(`event: connected\ndata: {"bookingId":"${bookingId}"}\n\n`);

    const subscriber = this.redis.duplicate();
    const channel = `booking:status:${bookingId}`;
    await subscriber.subscribe(channel);

    const onMessage = (chan: string, message: string) => {
      if (chan !== channel) return;
      res.write(`event: booking.status_changed\ndata: ${message}\n\n`);
    };
    subscriber.on("message", onMessage);

    // Periodic comment to keep the connection alive through proxies
    const heartbeat = setInterval(() => res.write(`: keepalive\n\n`), 30000);

    const cleanup = async () => {
      clearInterval(heartbeat);
      subscriber.off("message", onMessage);
      await subscriber.unsubscribe(channel).catch(() => undefined);
      subscriber.disconnect();
    };
    req.on("close", () => {
      void cleanup();
    });
    req.on("error", () => {
      void cleanup();
    });
  }
}
```

### Route — `apps/booking-service/src/sse/booking-events.routes.ts`

```ts
const router = Router();
router.use(requireUser);
router.get(
  "/:bookingId/events",
  asyncHandler((req, res) => bookingEventsController.stream(req, res)),
);
```

Mount in `apps/booking-service/src/api/v1/routes/index.ts`: `router.use("/bookings", bookingEventsRoutes)`. Booking-events routes sit alongside the future `booking.routes.ts`; auth is required at the gateway route level (`auth: "required"`).

### Auth

`requireUser` middleware (or the gateway's `gatewayAuthMiddleware` equivalent for routes exposed behind the api-gateway) is mandatory on this endpoint. The handler additionally verifies the booking's `userId` matches the authenticated user — no cross-user PNR leakage.

`EventSource` (native browser API) cannot set arbitrary headers, but the platform already uses HTTP cookies for `accessToken`, so the SSE connection picks them up automatically. No `Authorization: Bearer` header gymnastics.

---

## Phase 3 — SSE seat-map invalidation

### What gets pushed

Not the entire 700-seat payload. Just a tiny invalidation signal:

```
event: seat_map_invalidated
data: {"type":"SEAT_MAP_INVALIDATED","scheduleId":"..."}
```

Browser does:

```ts
eventSource.addEventListener("seat_map_invalidated", (e) => {
  const { scheduleId } = JSON.parse(e.data);
  queryClient.invalidateQueries({ queryKey: ["seat-map", scheduleId] });
  // React Query auto-refetches via the existing GET /seat-map endpoint
});
```

Server-side, search-service should also `redis.del(cache:seat-map:v1:<hash>)` for the affected `(scheduleId, fromStationId, toStationId)` tuples when it forwards the SSE event. This means the next browser refetch is a cold miss and re-warms with fresh data — even if the cache hasn't expired yet.

### Transport architecture

Same shape as Phase 2:

```
                  Kafka topics: BOOKING_CONFIRMED, BOOKING_CANCELLED
                              │
                              ▼
                  search-service SSE consumer (1 instance)
                              │
                              │  on each event
                              ▼
                  Redis pub/sub: seat-map:invalidated:<scheduleId>
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
          SSE conn A    SSE conn B    SSE conn C
          (Browser)     (Browser)     (Browser)
```

### SSE consumer — `apps/search-service/src/sse/seat-map-invalidator.ts`

Single Kafka consumer subscribed to both `BOOKING_CONFIRMED` and `BOOKING_CANCELLED` (consumer group: `SEARCH_SEAT_MAP_INVALIDATED`). On each parsed event:

```ts
const scheduleId = event.scheduleId;
await redis.publish(
  `seat-map:invalidated:${scheduleId}`,
  JSON.stringify({ type: "SEAT_MAP_INVALIDATED", scheduleId }),
);

// Also evict any cached seat-map entries for this schedule so the next
// refetch (even from a non-SSE client) is a cold miss.
const pattern = `${env.SEAT_MAP_CACHE_KEY_PREFIX}:v1:*`;
let cursor = "0";
do {
  const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
  cursor = next;
  // Schedule-id is part of the key material, so SCAN+DEL is bounded.
  // For the MVP, DEL everything matching the prefix — the key space is small.
  if (keys.length > 0) await redis.del(...keys);
} while (cursor !== "0");
```

### SSE controller — `apps/search-service/src/sse/seat-map-events.controller.ts`

Same shape as `BookingEventsController`, but:

- No auth (matches the REST endpoint's `auth: "none"`)
- Verifies the schedule exists (call `inventoryClient.getSeatMap` with the fromStationId/toStationId; if gRPC returns `SCHEDULE_NOT_FOUND`, the SSE endpoint returns 404)
- Subscribes to `seat-map:invalidated:<scheduleId>`
- Writes `event: seat_map_invalidated\ndata: {"type":"SEAT_MAP_INVALIDATED","scheduleId":"..."}\n\n` on each pub/sub message

### Route — `apps/search-service/src/sse/seat-map-events.routes.ts`

```ts
const router = Router();
router.get(
  "/schedules/:scheduleId/seat-map/events",
  validateParams(seatMapParamsSchema),
  validateQuery(seatMapQuerySchema),
  asyncHandler((req, res) => seatMapEventsController.stream(req, res)),
);
```

Mount in `apps/search-service/src/api/v1/routes/index.ts` — no gateway change needed (the existing `/api/v1/search` prefix routes everything under it).

### Auth

`auth: "none"` at the gateway (same as the REST seat-map endpoint). The SSE endpoint leaks no PII — it only pushes "this schedule had a booking event, refetch" signals, and the refetch response is already public.

---

## Reusable utilities (don't reinvent)

- `createGrpcClient(InventoryServiceDefinition, url, opts)` from `@irctc/grpc` — used by both `booking-service/src/grpc/inventory.client.ts` (existing) and the new `search-service` client
- `createRedisClient(env.REDIS_URL)` from `@irctc/redis` — search-service already wires this; `SeatMapService` reuses the same `Redis` client. Phase 2/3 SSE controllers call `redis.duplicate()` for pub/sub subscribers (a fresh connection is required because `ioredis` blocks the primary connection while in subscribe mode)
- `validateParams(zodSchema)` / `validateQuery(zodSchema)` from `@irctc/middleware` — same pattern as `apps/search service/src/api/v1/routes/search.routes.ts`
- `successResponse("...", payload)` from `@irctc/http` — matches existing controller style in `apps/search service/src/controllers/search.controller.ts`
- `ApiError`, `COMMON_ERROR_CODES` from `@irctc/errors` — `mapApiCodeToGrpcStatus` / `ClientError` from `@irctc/grpc` for the gRPC boundary
- Container singleton pattern from `apps/search service/src/container/search.container.ts` — `static getInstance()`, public fields on edges only
- `.openapi(...)` metadata on Zod schemas — picked up by orval during `pnpm codegen`
- **KafkaConsumerRunner + RetryPolicies** from `@irctc/kafka` — for the SSE consumers in Phase 2/3 (mirror the existing `schedule.consumer.ts` / `station.consumer.ts` pattern in search-service)
- **Native SSE**: no library needed. `res.write("event: ...\ndata: ...\n\n")` plus the right headers is the entire protocol. The browser's `EventSource` handles auto-reconnect with last-event-id for free
- **`X-Accel-Buffering: no`** response header — required when the gateway proxies SSE through nginx; without it, nginx buffers the event stream and the browser sees nothing until the buffer fills
- **Pub/sub subscriber pattern**: `redis.duplicate()` for the subscriber connection (separate from the primary client used for cache reads); `subscriber.on("message", cb)`; cleanup on `req.close` + `req.error`

## Critical Files

### Phase 1 (REST seat-map)

- `apps/search service/src/services/seat-map.service.ts` (new) — the composer (cache + ES pre-check + gRPC). Most of the load-bearing logic lives here.
- `apps/inventory-service/src/grpc/inventory.handler.ts` — `getSeatMap` handler (the overlap query, the group-by-coach mapping, the graceful degradation when `SeatAllocation` is absent).
- `packages/contracts/proto/irctc/inventory/v1/inventory.proto` — the contract. Wrong field tags/names cascade through regen, client, service.
- `apps/search service/src/container/search.container.ts` — wires the new gRPC client + `SeatMapService` into the existing container and `SearchController`. Two new public fields; constructor order matters.

### Phase 2 (SSE booking status)

- `apps/booking-service/src/sse/booking-event-broadcaster.ts` (new) — the single Kafka consumer + Redis pub/sub publisher. Wrong fan-out here and every browser SSE connection goes stale.
- `apps/booking-service/src/sse/booking-events.controller.ts` (new) — `req.user.userId` ownership check, `redis.duplicate()` for the subscriber, cleanup on `req.close`. The `X-Accel-Buffering: no` header and 30s heartbeat keep the connection alive through nginx and corporate proxies.
- `apps/booking-service/src/services/booking.service.ts` — every CAS transition now writes one extra `BookingStatusChangedV1` event to the outbox. Forgetting one transition = that status change is invisible to the SSE stream.

### Phase 3 (SSE seat-map invalidation)

- `apps/search-service/src/sse/seat-map-invalidator.ts` (new) — Kafka consumer → Redis publish → SCAN+DEL cache eviction. Same fan-out concern as Phase 2.
- `apps/search-service/src/sse/seat-map-events.controller.ts` (new) — public SSE stream (no auth), Redis subscriber, cleanup. Tiny event body, full refetch on the browser.
- `packages/contracts/src/booking/booking-events.v1.ts` + `topics.ts` + `event-types.ts` — the `BookingStatusChangedV1` event schema and topic name. Wrong field tags/names cascade through regen, consumer, broadcaster.

---

## Appendix A — Saga orchestrator + dual-side Redis Lua seat-lock

The booking flow described in `BOOKING_IMPLEMENTATION.md` (Stages 1–11) drives the saga in-line inside `BookingService`. The reference implementation at `D:\dev\itctc-clone\apps\booking-service\src\services\booking-saga.orchestrator.ts` instead splits that responsibility into a dedicated `BookingSagaOrchestrator` class plus a `SagaLog` table. This doc's Phase 2 SSE consumer sits on top of `BOOKING_STATUS_CHANGED`, which is emitted by **every** CAS transition regardless of whether the transitions live in `BookingService` or an orchestrator — so the SSE work in this doc is **independent of the orchestrator decision**. This appendix enumerates the orchestrator + dual-side Lua change list so it lives next to the SSE design.

### A.1 — What `BookingSagaOrchestrator` adds

One new class `apps/booking-service/src/services/booking-saga.orchestrator.ts` with three methods. Each delegates to `BookingService` for the actual DB / outbox writes — the orchestrator owns saga-step log transitions and Redis-lock release:

- `handleSeatsHeld(event)` — saga `HOLD_SEATS → CREATE_PAYMENT`, calls payment-service gRPC `CreateOrder`, booking `PENDING → SEATS_HELD → PAYMENT_PENDING`. Compensation path on `CreateOrder` failure sets booking `FAILED`, releases Redis locks, saga `CREATE_PAYMENT: FAILED`.
- `handleSeatsHoldFailed(event)` — booking `PENDING → FAILED`, saga `HOLD_SEATS: FAILED`, release Redis locks.
- `handleSeatHoldExpired(event)` — booking `→ EXPIRED`, saga `HOLD_SEATS: COMPENSATED`, release Redis locks.

`handlePaymentSuccess` stays on `BookingService` (it owns `paymentOrderId` + the `PAYMENT_PENDING → CONFIRMING → CONFIRMED` walk and the final outbox row).

### A.2 — What changes in `BookingService`

- `createBooking` becomes **idempotency → validation → gRPC `inventory.ValidateBooking` synchronous pre-flight → Redis segment-aware seat lock → `prisma.$transaction`** that writes `Booking` (PENDING), `SagaLog(HOLD_SEATS/PENDING)`, `OutboxEvent(BOOKING_HOLD_SEATS_REQUESTED)`, and `BookingIdempotencyKey`. The `ValidateBooking` pre-flight catches the schedule-level cheap invariants (`SCHEDULE_NOT_FOUND` / `SCHEDULE_INACTIVE` / `TRAIN_ALREADY_DEPARTED`) before any booking row is created. **No per-seat `CheckAvailability` gRPC call** — that was removed from the booking flow. On tx failure, the Redis lock is released in `finally`.
- The three `handle*` methods shrink to one-liners that delegate into `BookingSagaOrchestrator`.
- `handlePaymentSuccess` keeps the same body — it doesn't move into the orchestrator.

### A.3 — SSE impact (none)

The Phase 2 broadcaster in this doc subscribes to `BOOKING_STATUS_CHANGED`. The orchestrator decision changes **who** writes that outbox row internally, but the event still fires on every CAS transition (`PENDING → SEATS_HELD`, `SEATS_HELD → PAYMENT_PENDING`, `PAYMENT_PENDING → CONFIRMING`, `CONFIRMING → CONFIRMED`, plus the terminal transitions to `FAILED` / `EXPIRED` / `CANCELLING → CANCELLED`). No SSE code change required.

### A.4 — Dual-side Redis Lua seat-lock

In itctc-clone, **both** services carry their own copies of `seat-lock.lua` / `seat-unlock.lua` under `apps/<service>/src/lua/`, and `booking-service` additionally has `seat-renew.lua`. The two locks serve different purposes and complement each other; they are not shared.

| Side                | Scripts                                              | Lifetime                                | Purpose                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booking-service`   | `seat-lock.lua`, `seat-unlock.lua`, `seat-renew.lua` | `SEAT_HOLD_TTL_MS` ≈ 10 min (saga life) | Saga-scoped "I'm working on this booking" lock. Renewed by the saga every time it advances; released when the booking transitions out of the lock-sensitive state or on error.   |
| `inventory-service` | `seat-lock.lua`, `seat-unlock.lua`                   | ~10–30 s                                | Short critical-section lock inside `SeatAllocationService.holdSeats` around the Prisma transaction, so two concurrent consumers can't both write the same `SeatAllocation` rows. |

**Recommendation: yes, add the inventory-side lock as part of the orchestrator work.** `BOOKING_IMPLEMENTATION.md` Step 8 already requires `holdSeats` to take a Redis Lua lock; the lock protects the `SELECT ... FOR UPDATE` + bulk-insert section from a second consumer racing the same `{scheduleId, seatInventoryId}` rows.

**Why Lua, not normal Redis commands:** each script protects an invariant that a multi-RTT client loop cannot.

- `seat-lock.lua` — all-or-nothing multi-key `SETNX`. If any key fails, the script rolls back the keys it already set and returns `0`. A non-atomic loop can lock seats 1–3, fail on seat 4, and leave a partial hold that blocks other customers.
- `seat-unlock.lua` — ownership-checked `DEL`. Only deletes keys whose value equals the caller's `lockToken`. Prevents a process whose TTL expired from `DEL`-ing a key another customer now owns.
- `seat-renew.lua` (booking side only) — verify token before `EXPIRE`. Prevents a stale process from extending a lock it no longer holds.

#### Key shape — segment-aware (corrected for this project)

itctc-clone's keys (`{scheduleId}:{seatId}` on booking, `{scheduleId}:{seatInventoryId}` on inventory) are **correct only for full-run booking** — a seat is held for the entire schedule. This project supports **segment bookings** (A→B while another passenger holds A→D), and the `SeatAllocation` uniqueness constraint is on `(scheduleId, seatInventoryId, fromSequence, toSequence)`. The Lua key must mirror that constraint so Redis rejections and DB rejections line up; otherwise we get false conflicts (over-locking of non-overlapping legs) or false pass-throughs (Redis says OK, the DB unique constraint fails late).

- Booking side: `booking:lock:seat:{scheduleId}:{seatId}:{fromSeq}:{toSeq}` — one key per leg-range the booking covers. For a multi-leg booking, emit one key per leg sequence index.
- Inventory side: `inv:lock:seat:{scheduleId}:{seatInventoryId}:{fromSeq}:{toSeq}` — same segment dimension, inventory's view of the row.

The `fromSequence` / `toSequence` come from `RouteStop.sequenceNumber` for the passenger's `fromStationId` / `toStationId` — already available to `SeatLockService` because the dist project's `BOOKING_IMPLEMENTATION.md` Step 1a reserves them in `HoldSeatsRequestedV1` and Step 5a's DTO carries `legIndices` / `fromSequence` / `toSequence`. **Don't accept leg-less bookings** at the route-validation layer either; if any of `fromSequence` / `toSequence` is missing, throw `INVALID_INPUT` at the Zod layer (`.refine`) rather than silently falling back to a seat-only key.

The Lua scripts themselves (`seat-lock.lua`, `seat-unlock.lua`, `seat-renew.lua`) **do not change** — they iterate whatever `KEYS` they're given. The change is entirely in the JS-side key builder. The lock value (the ownership token) stays the `bookingId` UUID.

Why both seat dimension **and** segment dimension:

- Same seat, non-overlapping legs (A→B vs C→D) → different keys → both succeed. (Lock per-leg.)
- Same seat, overlapping legs (A→B vs A→C) → same key collision → second fails fast.
- Same seat, identical legs → same key collision → second fails fast.
- Same segment, different seats → different keys → both succeed. (Lock per-seat.)

A seat-only key (itctc-clone's current shape) collapses the first two cases into one collision, so the second passenger sees `SEAT_ALREADY_HELD` even though no real overlap exists — exactly the false-positive storm segment-aware booking has to avoid.

The Lua scripts stay duplicated per service (don't move them to `@irctc/redis` as a package); itctc-clone deliberately keeps them duplicated because the TTL and key shape differ between services.

### A.5 — Inventory-side changes that go with A.4

`BOOKING_IMPLEMENTATION.md` Step 8 already adds `SeatAllocationService` in `apps/inventory-service/src/services/seat-allocation.service.ts`. With the dual-side lock decision, that service must:

1. Take the inventory-side lock **segment-aware** — key shape is `inv:lock:seat:{scheduleId}:{seatInventoryId}:{fromSequence}:{toSequence}`. The keys are derived from the `HoldSeatsRequestedV1` event (it carries `fromStationId` / `toStationId`, which the service maps to `fromSequence` / `toSequence` via `RouteStop`). The lock is taken **after** seat validation but **before** the `SELECT ... FOR UPDATE` + bulk-insert section.
2. Release the same segment-aware keys in `finally` (success or failure).
3. Treat `acquired === false` as `SeatsHoldFailedV1` with reason `SEAT_ALREADY_HELD` (not an exception — the booking saga already saw `BOOKING_INVALID_TRANSITION` on the booking side and will reach the same conclusion via the matching Redis key).

Do **not** add `renewSeatLocks` on the inventory side — the critical section is short enough that the lock TTL (≥ 10 s) covers the worst case without renewal.

**No `CheckAvailability` to keep in sync**: that RPC was removed from the booking flow. The booking-side Redis key (`booking:lock:seat:<scheduleId>:<seatId>:<fromSeq>:<toSeq>`) and the inventory-side Redis key (`inv:lock:seat:<scheduleId>:<seatInventoryId>:<fromSeq>:<toSeq>`) are **both** segment-aware, so they cannot disagree about segment availability. The seat-map screen and the booking POST are decoupled — a stale seat-map can only cause a UI flicker (Phase 3 SSE invalidation brings it back to sub-second), not a correctness issue. The POST path's authoritative check is the inventory-side `holdSeats` consumer's segment-overlap query.

### A.6 — Files to add / edit

**New files (booking-service):**

- `apps/booking-service/src/services/booking-saga.orchestrator.ts` — orchestrator class
- `apps/booking-service/src/lua/seat-lock.lua`, `seat-unlock.lua`, `seat-renew.lua` — copy from `D:\dev\itctc-clone\apps\booking-service\src\lua\`
- (optional) `apps/booking-service/src/lua/index.ts` barrel

**New files (inventory-service):**

- `apps/inventory-service/src/services/seat-lock.service.ts` — `redis.eval(...)` wrapper for the two inventory-side scripts
- `apps/inventory-service/src/lua/seat-lock.lua`, `seat-unlock.lua` — copy from `D:\dev\itctc-clone\apps\inventory-service\src\lua\`
- (optional) `apps/inventory-service/src/lua/index.ts` barrel

**Edited files:**

- `apps/booking-service/src/services/booking.service.ts` — `createBooking` refactor + delegate `handle*` to orchestrator
- `apps/booking-service/src/services/index.ts` — re-export `BookingSagaOrchestrator`
- `apps/booking-service/src/container/booking.container.ts` — wire the orchestrator
- `apps/inventory-service/src/services/seat-allocation.service.ts` — take/release the inventory-side lock in `holdSeats`; treat `acquired === false` as `SeatsHoldFailedV1`
- `apps/inventory-service/src/container/inventory.container.ts` — wire `SeatLockService`
- Both services' `tsconfig.json` paths blocks — add `"@lua": ["./src/lua/index.js"]` if the barrel is adopted

### A.7 — Phase 2 SSE checklist after orchestrator lands

After `BookingSagaOrchestrator` is in place, run the existing Phase 2 SSE verification steps 13–17 from this doc to confirm the broadcaster still receives every `BOOKING_STATUS_CHANGED` row. If any transition fires **without** the matching outbox row, the orchestrator's per-state write is the place to fix.

### A.8 — Reference

- Plan file: `C:\Users\Admin\.claude\plans\floofy-wobbling-lantern.md` — same content in a single doc
- itctc-clone patterns to mirror: `D:\dev\itctc-clone\apps\booking-service\src\services\booking-saga.orchestrator.ts`, `D:\dev\itctc-clone\apps\booking-service\src\services\seat-lock.service.ts`, `D:\dev\itctc-clone\apps\inventory-service\src\services\seat-lock.service.ts`, and the five Lua files under both `apps/<service>/src/lua/`
- This appendix is the change list only. Implementation happens only after the orchestrator pattern + dual-side lock decision is approved; nothing is coded by this doc.

---

## Follow-ups (not in this plan)

1. **`coachType` / `berthType` / `quota` data quality.** The handler currently emits constants (`"SL"`, `"SEATER"`, `"GENERAL"`) because the columns don't exist on `SeatInventory`. Add a Prisma migration that mirrors `ScheduleCreatedEventV1.coaches[].coachType` down into the seat-inventory rows as part of the broader booking-implementation migration in `BOOKING_IMPLEMENTATION.md` Step 8.
2. **Two-level seat-map cache.** Coach layout is segment-independent; cache the coach grid once and overlay per-segment booked-seat sets. Out of scope here — premature optimization.
3. **`SeatInventory` repository refactor.** The handler uses `prisma` directly (known drift per the grpc-service skill). Move `findMany` + the allocation overlap query behind `SeatAllocationRepository` / `SeatInventoryRepository` in a separate change.
4. **Move `SeatAllocation.findMany` overlap query behind a repository.** Same drift — done in a separate change with the booking saga work.
5. **SSE backpressure.** If a browser tab is backgrounded for 30+ seconds and a flood of `BookingStatusChanged` events lands, the SSE controller buffers writes. Add a per-connection ring buffer (e.g. last 50 events) so the stream never grows unbounded. Out of scope until load testing shows the need.
6. **SSE auth on Phase 3.** Currently the seat-map SSE is public (`auth: "none"`). If you later want personalized seat-map updates (e.g. "you viewed this schedule, here's a hint when your preferred seat frees up"), promote the auth level to `optional` or `required`.
7. **Cancel on disconnect.** If the SSE controller throws mid-flight (e.g. Redis dies), the browser's `EventSource` auto-reconnects but the server-side subscription might be leaked. Add a `try { ... } finally { cleanup() }` around the controller body, plus a connection-count gauge on `/health/ready`.
8. **Phase 4 candidate — multi-tab dedupe.** Browsers share SSE connections per origin (6-connection cap on HTTP/1.1). If users open 5 tabs of the same seat-map, all 5 hit the server. Add a `BroadcastChannel`-based local dedupe on the browser so only one tab holds the open SSE; the others listen to the leader via localStorage events. Pure browser-side; no server change.
