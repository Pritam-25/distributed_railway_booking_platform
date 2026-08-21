import crypto from "node:crypto";
import {
  BookingStatus,
  SagaStatus,
  SagaStep,
  type Prisma,
  type PrismaClient,
} from "@generated/prisma/client.js";
import {
  EVENT_TYPES,
  KAFKA_TOPICS,
  type BookingStatusChangedV1Type,
  type HoldSeatsRequestedV1Type,
} from "@irctc/contracts";
import { type OutboxRepository } from "@irctc/kafka";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";
import { InventoryAdapter } from "@grpc";

import { env } from "@config";
import { type BookingRepository, type SagaRepository } from "@repository";
import { ERROR_CODES } from "@utils/errors";
import { type CreateBookingDto, type CreateBookingResponse } from "@dto";
import { SeatLockService } from "./seat-lock.service.js";

/**
 * Partial database fields that can be updated during a booking state transition.
 */
interface BookingTransitionUpdate {
  lockExpiresAt: Date;
  paymentOrderId: string;
  failureReason: string;
}

/**
 * Arguments for transitioning a booking status.
 */
interface TransitionArgs {
  bookingId: string;
  target: BookingStatus;
  allowedFrom?: BookingStatus;
  fromStates?: readonly BookingStatus[];
  updates?: Partial<BookingTransitionUpdate>;
}

/**
 * Service class implementing the booking-saga business logic.
 *
 * ## Responsibilities
 * - Validates and persists new bookings (`createBooking`).
 * - Drives the nine-state lifecycle: `PENDING → SEATS_HELD →
 *   PAYMENT_PENDING → CONFIRMING → CONFIRMED`, plus terminal branches
 *   `FAILED`, `EXPIRED`, `CANCELLING → CANCELLED`.
 * - Writes one `BookingStatusChangedV1` row to the transactional outbox
 *   per state transition so downstream consumers (and the future SSE
 *   broadcaster) see every CAS change atomically with the booking row.
 *
 * ## Concurrency
 * Every transition funnels through `bookingRepository.updateStatus`,
 * which uses an `updateMany` with a `version: { lt: expectedVersion }`
 * guard. Concurrent writers race at the database; exactly one wins,
 * the rest observe `updated: false` and surface `BOOKING_INVALID_TRANSITION`.
 *
 * Side effects: Postgres writes (always inside a transaction) and one
 * outbox-row insert per transition.
 */
export class BookingService {
  /**
   * Creates an instance of BookingService.
   *
   * @param prisma - PrismaClient for transaction orchestration.
   * @param bookingRepository - Booking aggregate repository.
   * @param outboxRepository - Transactional outbox repository.
   * @param seatLockService - Service for managing Redis distributed seat locks.
   * @param inventoryAdapter - Inventory gRPC client adapter.
   * @param sagaRepository - Booking saga repository.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bookingRepository: BookingRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly seatLockService: SeatLockService,
    private readonly inventoryAdapter: InventoryAdapter,
    private readonly sagaRepository: SagaRepository,
  ) {}

  /**
   * Creates a new booking row in the `PENDING` state and emits the
   * first `BookingStatusChangedV1` event (`previousStatus: null`).
   *
   * Idempotency: the caller passes an `idempotencyKey`; if the key has
   * already produced a booking, the stored response is returned
   * without re-running the saga.
   *
   * Concurrency: acquires Redis-backed distributed seat locks before
   * creating database records to prevent race conditions on seat availability.
   *
   * @param userId -  The authenticated user's UUID.
   * @param dto - The validated `CreateBookingDto`.
   * @returns - The persisted booking response summary.
   */
  async createBooking(
    userId: string,
    dto: CreateBookingDto,
  ): Promise<CreateBookingResponse> {
    // 1. HTTP Idempotency Check (Fast path)
    logger.debug(
      { module: "booking-service", idempotencyKey: dto.idempotencyKey },
      "Step 1: Checking fast-path idempotency key table",
    );

    const existingCheck = await this.bookingRepository.findIdempotencyKey(
      dto.idempotencyKey,
    );

    if (existingCheck) {
      const responseBody = existingCheck.responseBody as CreateBookingResponse;
      logger.info(
        {
          module: "booking-service",
          idempotencyKey: dto.idempotencyKey,
          bookingId: responseBody.id,
        },
        "Step 2: Idempotent createBooking replay (fast path)",
      );
      return responseBody;
    }

    // 2. Synchronous gRPC pre-flight — schedule-level invariants only.
    //    Surfaces SCHEDULE_NOT_FOUND / SCHEDULE_INACTIVE / TRAIN_ALREADY_DEPARTED
    //    before any booking row is written, no Redis lock, no outbox row.
    await this.inventoryAdapter.validateBooking(dto);

    // 2b. Resolve booking-side seatIds → inventory-side seatInventoryIds.
    //     Done OUTSIDE the prisma.s$transaction per the architecture rule
    //     ("never hold a transaction while doing I/O outside the DB").
    //     Uses the existing inventory gRPC channel; one round-trip per seat
    //     in parallel. A future migration can replace this with a local
    //     seat_inventory view in booking-service's Prisma schema.
    const seatInventoryIds =
      await this.inventoryAdapter.resolveSeatInventoryIds(
        dto.scheduleId,
        dto.seatIds,
      );

    // 3. Concurrency Lock: Acquire Redis distributed lock on seats (and optional journey legs) before DB transaction
    const bookingId = crypto.randomUUID();
    const lockTtlSeconds = Math.ceil(env.SEAT_HOLD_TTL_MS / 1000);

    // Derive journey leg sequence indices for segment-based Redis seat locking
    let legIndices: number[] | undefined = dto.legIndices;
    if (
      !legIndices &&
      dto.fromSequence !== undefined &&
      dto.toSequence !== undefined &&
      dto.toSequence > dto.fromSequence
    ) {
      legIndices = Array.from(
        { length: dto.toSequence - dto.fromSequence },
        (_, i) => dto.fromSequence! + i,
      );
    }

    logger.debug(
      {
        module: "booking-service",
        bookingId,
        scheduleId: dto.scheduleId,
        seatIds: dto.seatIds,
        legIndices,
      },
      "Step 3: Acquiring Redis distributed seat locks",
    );

    const locksAcquired = await this.seatLockService.acquireSeatLocks({
      scheduleId: dto.scheduleId,
      seatIds: dto.seatIds,
      lockToken: bookingId,
      ttlSeconds: lockTtlSeconds,
      legIndices,
    });

    if (!locksAcquired) {
      throw new ApiError(
        statusCode.conflict,
        ERROR_CODES.SEAT_HOLD_FAILED,
        "One or more selected seats are currently locked by another user. Please select different seats.",
      );
    }

    let result: CreateBookingResponse;
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          // 4. Re-verify idempotency inside transaction
          logger.debug(
            {
              module: "booking-service",
              bookingId,
              idempotencyKey: dto.idempotencyKey,
            },
            "Step 4: Re-verifying idempotency inside DB transaction",
          );
          const existing = await this.bookingRepository.findIdempotencyKey(
            dto.idempotencyKey,
            tx,
          );
          if (existing) {
            return existing.responseBody as CreateBookingResponse;
          }

          // 5. Generate PNR + insert booking row.
          const pnr = generatePnr();
          logger.debug(
            { module: "booking-service", bookingId, pnr },
            "Step 5: Generated PNR and inserting booking row in PENDING state",
          );
          const booking = await this.bookingRepository.create(
            {
              id: bookingId,
              pnr,
              userId,
              scheduleId: dto.scheduleId,
              fromStationId: dto.fromStationId,
              toStationId: dto.toStationId,
              status: BookingStatus.PENDING,
              version: 1,
            },
            tx,
          );

          // 6. Persist seat rows + passenger rows.
          logger.debug(
            {
              module: "booking-service",
              bookingId,
              seatCount: dto.seatIds.length,
              passengerCount: dto.passengers.length,
            },
            "Step 6: Persisting booking seats and passenger records",
          );
          await this.bookingRepository.createSeats(
            dto.seatIds.map((seatId) => ({
              bookingId: booking.id,
              seatId,
            })),
            tx,
          );
          await this.bookingRepository.createPassengers(
            dto.passengers.map((passenger) => ({
              bookingId: booking.id,
              fullName: passenger.fullName,
              age: passenger.age,
              gender: passenger.gender,
              berthPreference: passenger.berthPreference ?? null,
            })),
            tx,
          );

          // 7. Emit first BookingStatusChangedV1 row (PENDING with no previous status) to transactional outbox.
          logger.debug(
            { module: "booking-service", bookingId, status: booking.status },
            "Step 7: Emitting initial BookingStatusChangedV1 outbox event",
          );
          const statusChangedPayload: BookingStatusChangedV1Type = {
            eventId: crypto.randomUUID(),
            bookingId: booking.id,
            pnr: booking.pnr,
            userId: booking.userId,
            previousStatus: null,
            currentStatus:
              booking.status as BookingStatusChangedV1Type["currentStatus"],
            version: booking.version,
            updatedAt: new Date(),
          };

          await this.outboxRepository.insert(tx, {
            aggregateType: "Booking",
            aggregateId: booking.id,
            eventType: EVENT_TYPES.BOOKING_STATUS_CHANGED,
            topic: KAFKA_TOPICS.BOOKING_STATUS_CHANGED,
            payload: statusChangedPayload,
          });

          // 7b. Saga log row (HOLD_SEATS, PENDING) so the orchestrator can
          //     advance the step to COMPLETED once the inventory reply lands.
          logger.debug(
            { module: "booking-service", bookingId, step: SagaStep.HOLD_SEATS },
            "Step 7b: Recording saga log HOLD_SEATS / PENDING",
          );
          await this.sagaRepository.create(
            {
              bookingId: booking.id,
              step: SagaStep.HOLD_SEATS,
              status: SagaStatus.PENDING,
            },
            tx,
          );

          // 7d. Emit BOOKING_HOLD_SEATS_REQUESTED outbox event. Inventory's
          //     hold-seats consumer will pick this up, allocate seats, and
          //     emit INVENTORY_SEATS_HELD (or _FAILED) back to us.
          logger.debug(
            {
              module: "booking-service",
              bookingId,
              scheduleId: booking.scheduleId,
              seatInventoryCount: seatInventoryIds.length,
            },
            "Step 7d: Emitting BOOKING_HOLD_SEATS_REQUESTED outbox event",
          );
          const holdSeatsPayload: HoldSeatsRequestedV1Type = {
            eventId: crypto.randomUUID(),
            bookingId: booking.id,
            scheduleId: booking.scheduleId,
            userId: booking.userId,
            seatInventoryIds,
            fromStaionId: dto.fromStationId,
            toStationId: dto.toStationId,
            fromSequence: dto.fromSequence ?? 0,
            toSequence: dto.toSequence ?? 2147483647,
            holdTtlMs: env.SEAT_HOLD_TTL_MS,
            createdAt: new Date(),
          };

          await this.outboxRepository.insert(tx, {
            aggregateType: "Booking",
            aggregateId: booking.id,
            eventType: EVENT_TYPES.HOLD_SEATS_REQUESTED,
            topic: KAFKA_TOPICS.BOOKING_HOLD_SEATS_REQUESTED,
            payload: holdSeatsPayload,
          });

          // 8. Record the idempotency mapping so a retry returns the same booking.
          logger.debug(
            {
              module: "booking-service",
              bookingId,
              idempotencyKey: dto.idempotencyKey,
            },
            "Step 8: Recording idempotency mapping in DB",
          );
          const responseBody: CreateBookingResponse = {
            id: booking.id,
            pnr: booking.pnr,
            status: booking.status,
          };
          await this.bookingRepository.createIdempotencyKey(
            {
              idempotencyKey: dto.idempotencyKey,
              bookingId: booking.id,
              responseBody: responseBody as unknown as Prisma.InputJsonValue,
            },
            tx,
          );

          logger.info(
            {
              module: "booking-service",
              bookingId: booking.id,
              pnr: booking.pnr,
              userId,
            },
            "Booking successfully created in PENDING with Redis seat locks held",
          );

          return responseBody;
        },
        { timeout: 10000 },
      );
    } catch (err) {
      // Release seat locks if database transaction fails
      logger.warn(
        {
          module: "booking-service",
          bookingId,
          scheduleId: dto.scheduleId,
          legIndices,
        },
        "Releasing Redis seat locks due to booking transaction failure",
      );
      await this.seatLockService.releaseSeatLocks({
        scheduleId: dto.scheduleId,
        seatIds: dto.seatIds,
        lockToken: bookingId,
        legIndices,
      });
      throw err;
    }

    return result;
  }

  /**
   * Returns a booking by id, enforcing the owner check. Throws
   * `BOOKING_NOT_FOUND` (404) when the row is missing,
   * `BOOKING_FORBIDDEN` (403) when the requesting user doesn't own it.
   *
   * @param userId - The authenticated user's UUID.
   * @param bookingId - The booking UUID.
   */
  async findByIdForUser(userId: string, bookingId: string) {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking) {
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.BOOKING_NOT_FOUND,
        "The requested booking could not be found.",
      );
    }
    if (booking.userId !== userId) {
      throw new ApiError(
        statusCode.forbidden,
        ERROR_CODES.BOOKING_FORBIDDEN,
        "You do not have permission to view or manage this booking.",
      );
    }
    return {
      id: booking.id,
      pnr: booking.pnr,
      userId: booking.userId,
      scheduleId: booking.scheduleId,
      fromStationId: booking.fromStationId,
      toStationId: booking.toStationId,
      status: booking.status,
      totalPrice: booking.totalPrice.toString(),
      paymentOrderId: booking.paymentOrderId,
      failureReason: booking.failureReason,
      lockExpiresAt: booking.lockExpiresAt,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  /**
   * Loads a booking by its PNR string. Throws `BOOKING_NOT_FOUND` (404) when missing.
   *
   * @param pnr - The PNR string.
   */
  async findByPnr(pnr: string) {
    const booking = await this.bookingRepository.findByPnr(pnr);
    if (!booking) {
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.BOOKING_NOT_FOUND,
        "No booking was found matching the provided PNR.",
      );
    }
    return booking;
  }

  /**
   * Marks the booking as `SEATS_HELD`. Called by the saga after
   * inventory-service has confirmed the seat hold.
   *
   * @param bookingId - The booking UUID.
   * @param lockExpiresAt - Expiration timestamp for the seat hold.
   */
  async markSeatsHeld(bookingId: string, lockExpiresAt: Date): Promise<void> {
    await this.transition({
      bookingId,
      allowedFrom: BookingStatus.PENDING,
      target: BookingStatus.SEATS_HELD,
      updates: { lockExpiresAt },
    });
  }

  /**
   * Marks the booking as `PAYMENT_PENDING`. Called after payment-service
   * has created the order and a payment URL is ready.
   *
   * @param bookingId - The booking UUID.
   * @param paymentOrderId - Associated payment order UUID.
   */
  async markPaymentPending(
    bookingId: string,
    paymentOrderId: string,
  ): Promise<void> {
    await this.transition({
      bookingId,
      allowedFrom: BookingStatus.SEATS_HELD,
      target: BookingStatus.PAYMENT_PENDING,
      updates: { paymentOrderId },
    });
  }

  /**
   * Marks the booking as `CONFIRMING` once payment-service reports a
   * successful capture. The saga then commits the inventory-side seat
   * confirmations before flipping to `CONFIRMED`.
   *
   * @param bookingId - The booking UUID.
   */
  async markConfirming(bookingId: string): Promise<void> {
    await this.transition({
      bookingId,
      allowedFrom: BookingStatus.PAYMENT_PENDING,
      target: BookingStatus.CONFIRMING,
    });
  }

  /**
   * Marks the booking as `CONFIRMED` after inventory-service confirms
   * the seats have been promoted from HELD to CONFIRMED.
   *
   * @param bookingId - The booking UUID.
   */
  async markConfirmed(bookingId: string): Promise<void> {
    await this.transition({
      bookingId,
      allowedFrom: BookingStatus.CONFIRMING,
      target: BookingStatus.CONFIRMED,
    });
  }

  /**
   * Marks the booking as `FAILED`. The failure reason is persisted
   * alongside the status change.
   *
   * @param bookingId - The booking UUID.
   * @param reason - Reason describing why the booking failed.
   */
  async markFailed(bookingId: string, reason: string): Promise<void> {
    await this.transition({
      bookingId,
      target: BookingStatus.FAILED,
      updates: {
        failureReason: reason,
      },
    });
  }

  /**
   * Marks the booking as `EXPIRED`. Called by the seat-hold expiry
   * sweeper when the inventory-side lock lapses.
   *
   * @param bookingId - The booking UUID.
   */
  async markExpired(bookingId: string): Promise<void> {
    await this.transition({
      bookingId,
      target: BookingStatus.EXPIRED,
    });
  }

  /**
   * Initiates a cancellation: first flips the row to `CANCELLING` so
   * downstream observers see the transition, then to `CANCELLED` once
   * the inventory-side release is acknowledged.
   *
   * @param bookingId - The booking UUID.
   * @param userId - The authenticated user's UUID.
   */
  async cancelBooking(bookingId: string, userId: string): Promise<void> {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking) {
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.BOOKING_NOT_FOUND,
        `Booking not found for bookingId=${bookingId}.`,
      );
    }
    if (booking.userId !== userId) {
      throw new ApiError(
        statusCode.forbidden,
        ERROR_CODES.BOOKING_FORBIDDEN,
        `Booking ${bookingId} does not belong to this user.`,
      );
    }

    await this.transition({
      bookingId,
      target: BookingStatus.CANCELLING,
      fromStates: [BookingStatus.CONFIRMED, BookingStatus.SEATS_HELD],
    });

    await this.transition({
      bookingId,
      allowedFrom: BookingStatus.CANCELLING,
      target: BookingStatus.CANCELLED,
    });
  }

  /**
   * Simulates payment confirmation for a booking at `SEATS_HELD` or `PAYMENT_PENDING`.
   * Drives the booking row through `CONFIRMING → CONFIRMED` and completes the saga step.
   * Emits `BookingStatusChangedV1` outbox events for each status transition.
   *
   * @param bookingId - The booking UUID.
   * @param userId - The authenticated user's UUID.
   */
  async confirmPayment(bookingId: string, userId: string): Promise<void> {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking) {
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.BOOKING_NOT_FOUND,
        `Booking not found for bookingId=${bookingId}.`,
      );
    }
    if (booking.userId !== userId) {
      throw new ApiError(
        statusCode.forbidden,
        ERROR_CODES.BOOKING_FORBIDDEN,
        `Booking ${bookingId} does not belong to this user.`,
      );
    }

    if (booking.status === BookingStatus.SEATS_HELD) {
      await this.markPaymentPending(bookingId, `PAY-${crypto.randomUUID()}`);
    }

    await this.markConfirming(bookingId);
    await this.markConfirmed(bookingId);
    await this.sagaRepository.update(
      bookingId,
      SagaStep.CONFIRM_SEATS,
      SagaStatus.COMPLETED,
      null,
    );
  }

  /**
   * Executes a state transition for a booking record, enforcing state machine rules,
   * optimistic concurrency control, optional metadata updates, and transactional outbox event publishing.
   *
   * @param args - Object containing state transition parameters.
   * @param args.bookingId - The UUID of the booking to transition.
   * @param args.target - The target `BookingStatus` after transition.
   * @param args.allowedFrom - Optional single expected current status required for a valid transition.
   * @param args.fromStates - Optional list of permitted starting statuses when valid from multiple states.
   * @param args.updates - Optional partial column updates (`lockExpiresAt`, `paymentOrderId`, `failureReason`).
   */
  private async transition({
    bookingId,
    allowedFrom,
    target,
    fromStates,
    updates,
  }: TransitionArgs): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Step 1: Find booking by ID in current transaction
      const booking = await this.bookingRepository.findById(bookingId, tx);
      if (!booking) {
        logger.warn(
          { module: "booking-service", bookingId },
          "Booking not found, cannot perform transition.",
        );
        throw new ApiError(statusCode.notFound, ERROR_CODES.BOOKING_NOT_FOUND);
      }

      // Step 2: Validate allowed source state transition
      const permittedStates = fromStates ?? (allowedFrom ? [allowedFrom] : []);

      if (
        permittedStates.length > 0 &&
        !permittedStates.includes(booking.status)
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.BOOKING_INVALID_TRANSITION,
          `Booking ${bookingId} cannot transition from ${booking.status} to ${target}.`,
        );
      }

      // Step 3: Compute incremented version number
      const newVersion = booking.version + 1;

      // Step 4: Apply optional column updates (e.g. lockExpiresAt, paymentOrderId, failureReason)
      if (updates) {
        await this.bookingRepository.update(bookingId, updates, tx);
      }

      // Step 5: Execute atomic Compare-And-Swap (CAS) status update & version bump
      const updated = await this.bookingRepository.updateStatus(
        bookingId,
        target,
        newVersion,
        tx,
      );

      if (!updated) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.BOOKING_INVALID_TRANSITION,
          `Booking ${bookingId} status CAS failed — version ${booking.version} was stale.`,
        );
      }

      // Step 6: Emit BookingStatusChangedV1 event to transactional outbox
      const statusChangedPayload: BookingStatusChangedV1Type = {
        eventId: crypto.randomUUID(),
        bookingId: booking.id,
        pnr: booking.pnr,
        userId: booking.userId,
        previousStatus:
          booking.status as BookingStatusChangedV1Type["previousStatus"],
        currentStatus: target as BookingStatusChangedV1Type["currentStatus"],
        version: newVersion,
        updatedAt: new Date(),
      };

      await this.outboxRepository.insert(tx, {
        aggregateType: "Booking",
        aggregateId: booking.id,
        eventType: EVENT_TYPES.BOOKING_STATUS_CHANGED,
        topic: KAFKA_TOPICS.BOOKING_STATUS_CHANGED,
        payload: statusChangedPayload,
      });
    });
  }
}

/**
 * Generates a 10-character alphanumeric PNR (uppercase, base-32 sans
 * easily-confused chars). PNR is the unique ticket identifier the
 * user types in at the booking lookup screen.
 */
function generatePnr(): string {
  // 0-9 A-Z minus 0/O/1/I/L to reduce misreads
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(10);
  let pnr = "";
  for (const byte of bytes) {
    pnr += alphabet.charAt(byte % alphabet.length);
  }
  return pnr;
}
