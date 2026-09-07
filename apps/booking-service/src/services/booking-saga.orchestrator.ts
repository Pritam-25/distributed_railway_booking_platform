import {
  BookingStatus,
  SagaStatus,
  SagaStep,
  type PrismaClient,
} from "@generated/prisma/client.js";
import { type BookingRepository, type SagaRepository } from "@repository";
import { IdempotencyRepository } from "@irctc/redis";
import { logger } from "@irctc/logger";
import type { OutboxRepository } from "@irctc/kafka";
import {
  RefundStatus,
  type SeatsHeldV1Type,
  type SeatsHoldFailedV1Type,
  type SeatHoldExpiredV1Type,
  type PaymentSuccessV1,
  type PaymentRefundedV1Type,
  rupeesToPaise,
  sumPaise,
  paiseToRupees,
} from "@irctc/contracts";
import { executeBookingTransition } from "./booking-state-machine.js";

/**
 * ## Booking saga orchestrator
 *
 * Drives the booking lifecycle past `PENDING` based on incoming Kafka events
 * from inventory-service and payment-service.
 *
 * ### Concurrency & Idempotency
 * - Every handler uses two-phase Redis idempotency to guarantee exactly-once processing on event redeliveries.
 * - State transitions are atomically verified, applied via CAS, and published to outbox via `executeBookingTransition`.
 */
export class BookingSagaOrchestrator {
  private readonly logger = logger.child({
    module: "saga-orchestrator",
  });

  /**
   * @param prisma - Shared Prisma client.
   * @param bookingRepository - Booking aggregate repository.
   * @param sagaRepository - `SagaLog` repository.
   * @param idempotencyRepository - Two-phase Redis idempotency reservation store.
   * @param outboxRepository - Outbox event repository.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bookingRepository: BookingRepository,
    private readonly sagaRepository: SagaRepository,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Handles a successful inventory-side seat hold reply.
   * Updates passenger seat metadata, advances booking to `SEATS_HELD`, and completes saga step.
   *
   * @param event - Validated `SeatsHeldV1` payload.
   */
  async handleSeatsHeld(event: SeatsHeldV1Type): Promise<void> {
    const { eventId, bookingId, allocations } = event;
    const eventKey = `booking:held:${eventId}`;

    this.logger.info(
      { eventId, bookingId },
      "Handling SeatsHeldV1 (saga HOLD_SEATS reply)",
    );

    const reserved = await this.idempotencyRepository.reserveIfNew(eventKey);
    if (!reserved) {
      this.logger.info(
        { eventKey },
        "SeatsHeldV1 already in flight or processed, skipping",
      );
      return;
    }

    try {
      const passengersData = allocations.map(
        (alloc: SeatsHeldV1Type["allocations"][number]) => ({
          seatId: alloc.seatId,
          seatInventoryId: alloc.seatInventoryId,
          coachNumber: alloc.coachNumber,
          seatNumber: alloc.seatNumber,
          seatType: alloc.seatType,
          price: alloc.price,
        }),
      );

      const totalPaise = sumPaise(
        allocations.map((alloc) => rupeesToPaise(alloc.price)),
      );
      const totalPrice = paiseToRupees(totalPaise);

      await this.prisma.$transaction(async (tx) => {
        const booking = await this.bookingRepository.findById(bookingId, tx);
        if (!booking) {
          this.logger.error(
            { bookingId },
            "Booking missing for SeatsHeldV1 reply — retrying",
          );
          throw new Error(`Booking not found: ${bookingId}`);
        }

        if (booking.status !== BookingStatus.PENDING) {
          this.logger.info(
            {
              bookingId,
              status: booking.status,
            },
            "Booking not in PENDING state on SeatsHeldV1 — skipping transition",
          );
          return;
        }

        // 1. Map inventory allocation rows onto booking-side seat rows
        await this.bookingRepository.updateSeats(bookingId, passengersData, tx);

        // 2. Atomic CAS transition to SEATS_HELD via transition engine
        await executeBookingTransition(
          {
            tx,
            bookingRepository: this.bookingRepository,
            outboxRepository: this.outboxRepository,
          },
          {
            booking,
            target: BookingStatus.SEATS_HELD,
            allowedFrom: [BookingStatus.PENDING],
            updates: { totalPrice, lockExpiresAt: event.holdExpiresAt },
          },
        );

        // 3. Complete HOLD_SEATS step in saga log
        await this.sagaRepository.upsert(
          bookingId,
          SagaStep.HOLD_SEATS,
          SagaStatus.COMPLETED,
          null,
          tx,
        );

        this.logger.info(
          { bookingId, totalPrice },
          "Saga HOLD_SEATS step completed; booking in SEATS_HELD",
        );
      });

      await this.idempotencyRepository.markProcessed(eventKey);
    } catch (err) {
      await this.idempotencyRepository.release(eventKey);
      throw err;
    }
  }

  /**
   * Handles a failed inventory-side seat hold reply.
   * Flips booking to `FAILED` and records failure reason.
   *
   * @param event - Validated `SeatsHoldFailedV1` payload.
   */
  async handleSeatsHoldFailed(event: SeatsHoldFailedV1Type): Promise<void> {
    const { eventId, bookingId, reason, message } = event;
    const eventKey = `booking:failed:${eventId}`;

    this.logger.info(
      { eventId, bookingId, reason },
      "Handling SeatsHoldFailedV1 (saga HOLD_SEATS failure reply)",
    );

    const reserved = await this.idempotencyRepository.reserveIfNew(eventKey);
    if (!reserved) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        const booking = await this.bookingRepository.findById(bookingId, tx);
        if (!booking) {
          throw new Error(`Booking not found: ${bookingId}`);
        }

        if (booking.status === BookingStatus.PENDING) {
          await executeBookingTransition(
            {
              tx,
              bookingRepository: this.bookingRepository,
              outboxRepository: this.outboxRepository,
            },
            {
              booking,
              target: BookingStatus.FAILED,
              allowedFrom: [BookingStatus.PENDING],
              updates: { failureReason: message },
            },
          );

          await this.sagaRepository.upsert(
            bookingId,
            SagaStep.HOLD_SEATS,
            SagaStatus.FAILED,
            reason,
            tx,
          );
        } else {
          this.logger.info(
            { bookingId, status: booking.status },
            "Booking already advanced past PENDING; skipping FAILED transition",
          );
        }
      });

      await this.idempotencyRepository.markProcessed(eventKey);
    } catch (err) {
      await this.idempotencyRepository.release(eventKey);
      throw err;
    }
  }

  /**
   * Handles a saga compensation event when the inventory-side hold has
   * lapsed before the booking reached `CONFIRMED`.
   *
   * @param event - Validated `SeatHoldExpiredV1` payload.
   */
  async handleSeatHoldExpired(event: SeatHoldExpiredV1Type): Promise<void> {
    const { eventId, bookingId } = event;
    const eventKey = `booking:expired:${eventId}`;

    this.logger.info(
      { eventId, bookingId },
      "Handling SeatHoldExpiredV1 (saga HOLD_SEATS compensation)",
    );

    const reserved = await this.idempotencyRepository.reserveIfNew(eventKey);
    if (!reserved) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        const booking = await this.bookingRepository.findById(bookingId, tx);
        if (!booking) {
          throw new Error(`Booking not found: ${bookingId}`);
        }

        if (
          booking.status === BookingStatus.SEATS_HELD ||
          booking.status === BookingStatus.PENDING
        ) {
          await executeBookingTransition(
            {
              tx,
              bookingRepository: this.bookingRepository,
              outboxRepository: this.outboxRepository,
            },
            {
              booking,
              target: BookingStatus.EXPIRED,
              allowedFrom: [BookingStatus.PENDING, BookingStatus.SEATS_HELD],
            },
          );

          await this.sagaRepository.upsert(
            bookingId,
            SagaStep.RELEASE_SEATS,
            SagaStatus.COMPLETED,
            "Hold duration expired",
            tx,
          );
        } else {
          this.logger.info(
            { bookingId, status: booking.status },
            "Booking already past SEATS_HELD; skipping EXPIRED transition",
          );
        }
      });

      await this.idempotencyRepository.markProcessed(eventKey);
    } catch (err) {
      await this.idempotencyRepository.release(eventKey);
      throw err;
    }
  }

  /**
   * Handles a successful payment event emitted by payment-service via Kafka.
   * Atomically transitions booking to `CONFIRMED` in a single transaction with the
   * authoritative paymentOrderId from payment-service, and marks saga steps COMPLETED.
   *
   * @param event - Validated PaymentSuccessV1 payload.
   */
  async handlePaymentSuccess(event: PaymentSuccessV1): Promise<void> {
    const { eventId, bookingId, paymentOrderId } = event;
    const eventKey = `booking:payment_success:${eventId}`;

    this.logger.info(
      {
        eventId,
        bookingId,
        paymentOrderId,
      },
      "Handling PaymentSuccessV1 (payment-service event)",
    );

    const reserved = await this.idempotencyRepository.reserveIfNew(eventKey);
    if (!reserved) {
      this.logger.info(
        { eventKey },
        "PaymentSuccessV1 already in flight or processed, skipping",
      );
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const booking = await this.bookingRepository.findById(bookingId, tx);
        if (!booking) {
          this.logger.error(
            { bookingId },
            "Booking missing for PaymentSuccessV1 event",
          );
          return;
        }

        if (
          booking.status === BookingStatus.SEATS_HELD ||
          booking.status === BookingStatus.PAYMENT_PENDING ||
          booking.status === BookingStatus.CONFIRMING
        ) {
          // 1. Advance CREATE_PAYMENT step in saga log to COMPLETED
          await this.sagaRepository.upsert(
            bookingId,
            SagaStep.CREATE_PAYMENT,
            SagaStatus.COMPLETED,
            null,
            tx,
          );

          // 2. Atomically transition booking to CONFIRMED with the authoritative paymentOrderId
          await executeBookingTransition(
            {
              tx,
              bookingRepository: this.bookingRepository,
              outboxRepository: this.outboxRepository,
            },
            {
              booking,
              target: BookingStatus.CONFIRMED,
              allowedFrom: [
                BookingStatus.SEATS_HELD,
                BookingStatus.PAYMENT_PENDING,
                BookingStatus.CONFIRMING,
              ],
              updates: {
                paymentOrderId: paymentOrderId || booking.paymentOrderId,
              },
            },
          );

          // 3. Complete CONFIRM_SEATS step in saga log
          await this.sagaRepository.upsert(
            bookingId,
            SagaStep.CONFIRM_SEATS,
            SagaStatus.COMPLETED,
            null,
            tx,
          );

          this.logger.info(
            { bookingId, paymentOrderId },
            "Payment success processed: booking transitioned to CONFIRMED atomically",
          );
        } else {
          this.logger.info(
            {
              bookingId,
              status: booking.status,
            },
            "Booking not in payment-pending state — skipping PaymentSuccessV1 transition",
          );
        }
      });

      await this.idempotencyRepository.markProcessed(eventKey);
    } catch (err) {
      await this.idempotencyRepository.release(eventKey);
      throw err;
    }
  }

  /**
   * Handles payment refund result events emitted by payment-service via Kafka.
   * Updates REFUND_PAYMENT saga step based on outcome:
   * - PROCESSED → COMPLETED
   * - FAILED / REVERSED → FAILED
   * - PENDING → no-op
   *
   * @param event - Validated PaymentRefundedV1 payload.
   */
  async handlePaymentRefunded(event: PaymentRefundedV1Type): Promise<void> {
    const { eventId, bookingId, status, reason } = event;
    const eventKey = `booking:refunded:${eventId}`;

    this.logger.info(
      {
        eventId,
        bookingId,
        status,
        reason,
      },
      "Handling PaymentRefundedV1 (payment-service event)",
    );

    const reserved = await this.idempotencyRepository.reserveIfNew(eventKey);
    if (!reserved) {
      this.logger.info(
        { eventKey },
        "PaymentRefundedV1 already in flight or processed, skipping",
      );
      return;
    }

    try {
      if (status === RefundStatus.PROCESSED) {
        await this.sagaRepository.upsert(
          bookingId,
          SagaStep.REFUND_PAYMENT,
          SagaStatus.COMPLETED,
          null,
        );
        this.logger.info(
          { bookingId },
          "REFUND_PAYMENT saga step marked COMPLETED.",
        );
      } else if (
        status === RefundStatus.FAILED ||
        status === RefundStatus.REVERSED
      ) {
        await this.sagaRepository.upsert(
          bookingId,
          SagaStep.REFUND_PAYMENT,
          SagaStatus.FAILED,
          reason || `Refund ${status.toLowerCase()}`,
        );
        this.logger.warn(
          { bookingId, status, reason },
          `REFUND_PAYMENT saga step marked FAILED (${status}). Booking remains CANCELLED.`,
        );
      }

      await this.idempotencyRepository.markProcessed(eventKey);
    } catch (err) {
      await this.idempotencyRepository.release(eventKey);
      throw err;
    }
  }
}
