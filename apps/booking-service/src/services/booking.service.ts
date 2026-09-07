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
  GetOrderStatusResponse_Status,
  RefundStatus,
  type BookingStatusChangedV1Type,
  type HoldSeatsRequestedV1Type,
  type BookingRefundRequestedV1Type,
  formatRupees,
  rupeesToPaise,
  paiseToNumber,
} from "@irctc/contracts";
import { type OutboxRepository } from "@irctc/kafka";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";
import { InventoryAdapter, PaymentAdapter } from "@grpc";

import { env } from "@config";
import { type BookingRepository, type SagaRepository } from "@repository";
import { ERROR_CODES } from "@utils/errors";
import {
  type CreateBookingDto,
  type CreateBookingResponse,
  type CancelBookingResponse,
  type PayBookingResponse,
} from "@dto";
import { SeatLockService } from "./seat-lock.service.js";
import {
  CANCELLABLE_BOOKING_STATUSES,
  executeBookingTransition,
  mapSagaStatusToRefundStatus,
} from "./booking-state-machine.js";

/**
 * Service class implementing the booking domain and user-facing lifecycle.
 *
 * ## Responsibilities
 * - Validates and persists new bookings (`createBooking`).
 * - Executes user-driven cancellations and refund dispatch (`cancelBooking`).
 * - Coordinates payment order generation with payment-service (`createPaymentOrder`).
 * - Provides authenticated queries (`findByIdForUser`, `findByPnr`).
 *
 * ## Concurrency & Consistency
 * State mutations are funneled through `executeBookingTransition`, enforcing
 * optimistic concurrency control via version-guarded CAS and publishing
 * `BookingStatusChangedV1` outbox events atomically.
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
   * @param paymentAdapter - Payment gRPC client adapter.
   * @param sagaRepository - Booking saga repository.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bookingRepository: BookingRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly seatLockService: SeatLockService,
    private readonly inventoryAdapter: InventoryAdapter,
    private readonly paymentAdapter: PaymentAdapter,
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
   * @param userId - The authenticated user's UUID.
   * @param dto - The validated `CreateBookingDto`.
   * @param idempotencyKey - Unique idempotency key from request header.
   * @returns The persisted booking response summary.
   */
  async createBooking(
    userId: string,
    dto: CreateBookingDto,
    idempotencyKey: string,
  ): Promise<CreateBookingResponse> {
    // 1. HTTP Idempotency Check (Fast path)
    const existingCheck =
      await this.bookingRepository.findIdempotencyKey(idempotencyKey);

    if (existingCheck) {
      logger.info(
        {
          module: "createBooking",
          idempotencyKey,
          existingBookingId: existingCheck.id,
        },
        "Idempotency check passed for idempotency key, returning existing booking response.",
      );
      return existingCheck.responseBody as CreateBookingResponse;
    }

    // 2. Synchronous gRPC pre-flight — schedule invariants, seat availability, sequence derivation
    const { seatInventoryIds, fromSequence, toSequence } =
      await this.inventoryAdapter.validateBooking(dto);

    // 3. Concurrency Lock: Acquire Redis distributed lock on seats & journey legs
    const bookingId = crypto.randomUUID();
    const lockTtlSeconds = Math.ceil(env.SEAT_HOLD_TTL_MS / 1000);

    const legIndices =
      toSequence > fromSequence
        ? Array.from(
            { length: toSequence - fromSequence },
            (_, i) => fromSequence + i,
          )
        : undefined;

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

    let isReplay = false;
    let result: CreateBookingResponse;
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          // 4. Re-verify idempotency inside transaction
          const existing = await this.bookingRepository.findIdempotencyKey(
            idempotencyKey,
            tx,
          );
          if (existing) {
            isReplay = true;
            return existing.responseBody as CreateBookingResponse;
          }

          // 5. Generate PNR + insert booking row
          const pnr = generatePnr();

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

          // 6. Persist seat rows + passenger rows
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

          // 7. Emit first BookingStatusChangedV1 row (PENDING with no previous status)
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

          // 7b. Initialize saga steps
          await this.sagaRepository.create(
            {
              bookingId: booking.id,
              step: SagaStep.HOLD_SEATS,
              status: SagaStatus.PENDING,
            },
            tx,
          );

          await this.sagaRepository.create(
            {
              bookingId: booking.id,
              step: SagaStep.CREATE_PAYMENT,
              status: SagaStatus.PENDING,
            },
            tx,
          );

          await this.sagaRepository.create(
            {
              bookingId: booking.id,
              step: SagaStep.CONFIRM_SEATS,
              status: SagaStatus.PENDING,
            },
            tx,
          );

          // 7c. Emit BOOKING_HOLD_SEATS_REQUESTED outbox event
          const holdSeatsPayload: HoldSeatsRequestedV1Type = {
            eventId: crypto.randomUUID(),
            bookingId: booking.id,
            scheduleId: booking.scheduleId,
            userId: booking.userId,
            seatInventoryIds,
            fromStaionId: dto.fromStationId,
            toStationId: dto.toStationId,
            fromSequence,
            toSequence,
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

          // 8. Record the idempotency mapping
          const responseBody: CreateBookingResponse = {
            id: booking.id,
            pnr: booking.pnr,
            status: booking.status,
          };

          await this.bookingRepository.createIdempotencyKey(
            {
              idempotencyKey,
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

    if (isReplay) {
      logger.info(
        {
          module: "booking-service",
          idempotencyKey,
          lockToken: bookingId,
        },
        "Releasing transient Redis seat locks acquired during in-transaction idempotency replay",
      );
      await this.seatLockService.releaseSeatLocks({
        scheduleId: dto.scheduleId,
        seatIds: dto.seatIds,
        lockToken: bookingId,
        legIndices,
      });
    }

    return result;
  }

  /**
   * Cancels a booking atomically in a single database transaction.
   *
   * 1. Validates ownership and cancellability against state machine rules.
   * 2. Checks if captured payment exists requiring a refund.
   * 3. Transitions status to CANCELLED atomically via CAS and emits status change outbox event.
   * 4. If refund required, records REFUND_PAYMENT saga log (PENDING) and emits
   *    BookingRefundRequestedV1 to outbox.
   *
   * @param bookingId - The booking UUID.
   * @param userId - The authenticated user's UUID.
   * @returns Cancellation summary with bookingId, status, and refund details or null.
   */
  async cancelBooking(
    bookingId: string,
    userId: string,
  ): Promise<CancelBookingResponse> {
    const booking = await this.getOwnedBooking(bookingId, userId);

    // Idempotent fast path: already cancelled
    if (booking.status === BookingStatus.CANCELLED) {
      const refundSaga = await this.sagaRepository.findByBookingAndStep(
        bookingId,
        SagaStep.REFUND_PAYMENT,
      );
      return {
        bookingId,
        status: BookingStatus.CANCELLED,
        refund: refundSaga
          ? {
              id: null,
              status: mapSagaStatusToRefundStatus(refundSaga.status),
              amount: booking.totalPrice
                ? booking.totalPrice.toString()
                : "0.00",
              currency: "INR",
            }
          : null,
      };
    }

    // Validate cancellation eligibility against allowed states
    if (!CANCELLABLE_BOOKING_STATUSES.includes(booking.status)) {
      throw new ApiError(
        statusCode.conflict,
        ERROR_CODES.CANCELLATION_NOT_ALLOWED,
        `Booking in ${booking.status} status cannot be cancelled.`,
      );
    }

    // Determine if captured payment requires a refund
    const requiresRefund = await this.isPaymentCaptured(booking);
    const sagaId = crypto.randomUUID();

    await this.prisma.$transaction(async (tx) => {
      // 1. Atomic transition to CANCELLED via state transition engine
      await executeBookingTransition(
        {
          tx,
          bookingRepository: this.bookingRepository,
          outboxRepository: this.outboxRepository,
        },
        {
          booking,
          target: BookingStatus.CANCELLED,
          allowedFrom: CANCELLABLE_BOOKING_STATUSES,
        },
      );

      // 2. If refund required: record saga log + emit BookingRefundRequestedV1
      if (requiresRefund && booking.paymentOrderId) {
        await this.sagaRepository.upsert(
          bookingId,
          SagaStep.REFUND_PAYMENT,
          SagaStatus.PENDING,
          null,
          tx,
        );

        const refundRequestedPayload: BookingRefundRequestedV1Type = {
          eventId: crypto.randomUUID(),
          bookingId: booking.id,
          paymentId: booking.paymentOrderId,
          paymentOrderId: booking.paymentOrderId,
          amount: formatRupees(booking.totalPrice ?? "0.00"),
          currency: "INR",
          idempotencyKey: crypto.randomUUID(),
          reason: "User-initiated cancellation",
          sagaId,
          createdAt: new Date(),
        };

        await this.outboxRepository.insert(tx, {
          aggregateType: "Booking",
          aggregateId: booking.id,
          eventType: EVENT_TYPES.BOOKING_REFUND_REQUESTED,
          topic: KAFKA_TOPICS.BOOKING_REFUND_REQUESTED,
          payload: refundRequestedPayload,
        });
      }
    });

    logger.info(
      { module: "booking-service", bookingId, requiresRefund, sagaId },
      "Booking cancelled atomically and outbox event published.",
    );

    return {
      bookingId,
      status: BookingStatus.CANCELLED,
      refund: requiresRefund
        ? {
            id: null,
            status: RefundStatus.PENDING,
            amount: formatRupees(booking.totalPrice ?? "0.00"),
            currency: "INR",
          }
        : null,
    };
  }

  /**
   * Initiates payment for a booking in `SEATS_HELD` / `PAYMENT_PENDING` state
   * by calling payment-service over gRPC to create a Razorpay order.
   *
   * @param bookingId - The booking UUID.
   * @param userId - The authenticated user's UUID.
   */
  async createPaymentOrder(
    bookingId: string,
    userId: string,
  ): Promise<PayBookingResponse> {
    const booking = await this.getOwnedBooking(bookingId, userId);

    let paymentOrder;
    try {
      const amountPaise = rupeesToPaise(booking.totalPrice);
      paymentOrder = await this.paymentAdapter.createOrder({
        bookingId: booking.id,
        userId: booking.userId,
        amount: paiseToNumber(amountPaise),
        currency: "INR",
      });
    } catch (err) {
      logger.error(
        { module: "booking-service", bookingId, err },
        "gRPC call to payment-service failed for order creation.",
      );
      await this.sagaRepository
        .upsert(
          bookingId,
          SagaStep.CREATE_PAYMENT,
          SagaStatus.FAILED,
          err instanceof Error ? err.message : "Payment service unavailable",
        )
        .catch(() => {});

      throw new ApiError(
        statusCode.serviceUnavailable,
        COMMON_ERROR_CODES.INTERNAL_ERROR,
        "Payment service is currently unavailable. Please try again.",
      );
    }

    await this.sagaRepository
      .upsert(bookingId, SagaStep.CREATE_PAYMENT, SagaStatus.COMPLETED, null)
      .catch(() => {});

    // Transition from SEATS_HELD to PAYMENT_PENDING if not already transitioned
    if (booking.status === BookingStatus.SEATS_HELD) {
      await this.prisma.$transaction(async (tx) => {
        await executeBookingTransition(
          {
            tx,
            bookingRepository: this.bookingRepository,
            outboxRepository: this.outboxRepository,
          },
          {
            booking,
            target: BookingStatus.PAYMENT_PENDING,
            allowedFrom: [BookingStatus.SEATS_HELD],
            updates: { paymentOrderId: paymentOrder.paymentOrderId },
          },
        );
      });
    }

    return {
      paymentOrderId: paymentOrder.paymentOrderId,
      razorpayOrderId: paymentOrder.razorpayOrderId,
      keyId: paymentOrder.keyId,
      status: paymentOrder.status,
    };
  }

  /**
   * Loads a booking and ensures the requesting user is the owner.
   * Throws 404 (BOOKING_NOT_FOUND) when missing, 403 (BOOKING_FORBIDDEN) when unowned.
   *
   * @param bookingId - The booking UUID.
   * @param userId - The requesting user UUID.
   * @param tx - Optional transaction client.
   * @returns The authenticated Booking record.
   */
  async getOwnedBooking(
    bookingId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const booking = await this.bookingRepository.findById(bookingId, tx);
    if (!booking) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.BOOKING_NOT_FOUND);
    }
    if (booking.userId !== userId) {
      throw new ApiError(statusCode.forbidden, ERROR_CODES.BOOKING_FORBIDDEN);
    }
    return booking;
  }

  /**
   * Determines if a captured payment exists for this booking that requires a refund.
   * For CONFIRMED bookings, payment is already captured.
   * For PAYMENT_PENDING bookings, queries payment-service via gRPC to check authoritative status.
   */
  private async isPaymentCaptured(booking: {
    status: BookingStatus;
    paymentOrderId: string | null;
  }): Promise<boolean> {
    if (booking.status === BookingStatus.CONFIRMED) {
      return true;
    }
    if (
      booking.status === BookingStatus.PAYMENT_PENDING &&
      booking.paymentOrderId
    ) {
      try {
        const orderStatus = await this.paymentAdapter.getOrderStatus({
          paymentOrderId: booking.paymentOrderId,
        });
        return orderStatus.status === GetOrderStatusResponse_Status.CAPTURED;
      } catch (err) {
        logger.warn(
          {
            module: "booking-service",
            paymentOrderId: booking.paymentOrderId,
            err,
          },
          "Failed to query payment status over gRPC during cancellation. Defaulting to false.",
        );
        return false;
      }
    }
    return false;
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
