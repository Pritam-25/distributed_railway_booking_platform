import {
  BookingStatus,
  SagaStatus,
  SagaStep,
  type PrismaClient,
} from "@generated/prisma/client.js";
import { type BookingRepository, type SagaRepository } from "@repository";
import { IdempotencyRepository } from "@irctc/redis";
import { logger } from "@irctc/logger";
import type {
  SeatsHeldV1Type,
  SeatsHoldFailedV1Type,
  SeatHoldExpiredV1Type,
} from "@irctc/contracts";
import type { BookingService } from "./booking.service.js";

/**
 * ## Booking saga orchestrator
 *
 * Drives the booking lifecycle past `PENDING` based on replies from
 * inventory-service. Each handler is wrapped in a two-phase Redis
 * idempotency reservation so a Kafka redelivery does not replay the
 * database writes.
 *
 * ### Concurrency
 * All three handlers run inside `prisma.$transaction` and rely on the
 * existing CAS path in `BookingRepository.updateStatus` (version-guarded
 * `updateMany`). A redelivered event that finds the booking in a terminal
 * state is logged and skipped — no exceptions, no double writes.
 */
export class BookingSagaOrchestrator {
  /**
   * @param prisma - Shared Prisma client (used for the per-handler
   *   transaction that flips the booking status and advances the saga log).
   * @param bookingRepository - Booking aggregate repository.
   * @param sagaRepository - `SagaLog` repository.
   * @param idempotencyRepository - Two-phase Redis idempotency
   *   reservation store keyed by event id.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bookingRepository: BookingRepository,
    private readonly sagaRepository: SagaRepository,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Handles a successful inventory-side seat hold reply.
   *
   * @param event - Validated `SeatsHeldV1` payload.
   */
  async handleSeatsHeld(event: SeatsHeldV1Type): Promise<void> {
    const { eventId, bookingId, allocations } = event;
    const eventKey = `booking:held:${eventId}`;

    logger.info(
      { module: "booking-saga-orchestrator", eventId, bookingId },
      "Handling SeatsHeldV1 (saga HOLD_SEATS reply)",
    );

    const reserved = await this.idempotencyRepository.reserveIfNew(eventKey);
    if (!reserved) {
      logger.info(
        { module: "booking-saga-orchestrator", eventKey },
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

      const totalPrice = allocations.reduce(
        (sum: number, alloc: SeatsHeldV1Type["allocations"][number]) =>
          sum + alloc.price,
        0,
      );

      await this.prisma.$transaction(async (tx) => {
        const booking = await this.bookingRepository.findById(bookingId, tx);
        if (!booking) {
          logger.error(
            { module: "booking-saga-orchestrator", bookingId },
            "Booking missing for SeatsHeldV1 reply — retrying",
          );
          throw new Error(`Booking not found: ${bookingId}`);
        }

        if (booking.status !== BookingStatus.PENDING) {
          logger.info(
            {
              module: "booking-saga-orchestrator",
              bookingId,
              status: booking.status,
            },
            "Booking not in PENDING state on SeatsHeldV1 — skipping transition",
          );
          return;
        }

        // 1. Map inventory allocation rows onto booking-side seat rows.
        await this.bookingRepository.updatePassengers(
          bookingId,
          passengersData,
          tx,
        );

        // 2. CAS booking → SEATS_HELD.
        const advanced = await this.bookingRepository.updateStatus(
          bookingId,
          BookingStatus.SEATS_HELD,
          booking.version + 1,
          tx,
        );
        if (!advanced) {
          throw new Error(
            `Booking ${bookingId} CAS collision on PENDING → SEATS_HELD`,
          );
        }

        // 3. Aggregate seat prices onto the booking.
        await tx.booking.update({
          where: { id: bookingId },
          data: { totalPrice, lockExpiresAt: event.holdExpiresAt },
        });

        // 4. Advance the saga log.
        await this.sagaRepository.update(
          bookingId,
          SagaStep.HOLD_SEATS,
          SagaStatus.COMPLETED,
          null,
          tx,
        );

        logger.info(
          { module: "booking-saga-orchestrator", bookingId, totalPrice },
          "Saga HOLD_SEATS step completed; booking in SEATS_HELD",
        );
      });

      await this.idempotencyRepository.markProcessed(eventKey);
    } catch (err) {
      await this.idempotencyRepository.release(eventKey);
      throw err;
    }

    // Post-CAS auto-advance: SEATS_HELD → PAYMENT_PENDING (no real payment
    // integration yet). The auto-confirm worker will later flip
    // PAYMENT_PENDING → CONFIRMING → CONFIRMED after BOOKING_AUTO_CONFIRM_DELAY_MS.
    // Errors here are logged but do not retry — a Kafka redelivery of
    // SeatsHeldV1 will hit the `booking.status !== BookingStatus.PENDING`
    // early-return above and bail out cleanly.
    try {
      await this.bookingService.markPaymentPending(
        bookingId,
        `auto-${bookingId}`,
      );
    } catch (err) {
      logger.warn(
        {
          module: "booking-saga-orchestrator",
          bookingId,
          err: err instanceof Error ? err.message : err,
        },
        "Post-HOLD_SEATS auto-advance to PAYMENT_PENDING failed",
      );
    }
  }

  /**
   * Handles a failed inventory-side seat hold reply.
   *
   * @param event - Validated `SeatsHoldFailedV1` payload.
   */
  async handleSeatsHoldFailed(event: SeatsHoldFailedV1Type): Promise<void> {
    const { eventId, bookingId, reason, message } = event;
    const eventKey = `booking:failed:${eventId}`;

    logger.info(
      {
        module: "booking-saga-orchestrator",
        eventId,
        bookingId,
        reason,
      },
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
          await this.bookingRepository.updateStatus(
            bookingId,
            BookingStatus.FAILED,
            booking.version + 1,
            tx,
          );
          await tx.booking.update({
            where: { id: bookingId },
            data: { failureReason: message },
          });
          await this.sagaRepository.update(
            bookingId,
            SagaStep.HOLD_SEATS,
            SagaStatus.FAILED,
            reason,
            tx,
          );
        } else {
          logger.info(
            {
              module: "booking-saga-orchestrator",
              bookingId,
              status: booking.status,
            },
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

    logger.info(
      { module: "booking-saga-orchestrator", eventId, bookingId },
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
          await this.bookingRepository.updateStatus(
            bookingId,
            BookingStatus.EXPIRED,
            booking.version + 1,
            tx,
          );
          await this.sagaRepository.update(
            bookingId,
            SagaStep.HOLD_SEATS,
            SagaStatus.COMPENSATED,
            "Hold duration expired",
            tx,
          );
        } else {
          logger.info(
            {
              module: "booking-saga-orchestrator",
              bookingId,
              status: booking.status,
            },
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
}
