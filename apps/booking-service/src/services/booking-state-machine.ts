import crypto from "node:crypto";
import {
  BookingStatus,
  SagaStatus,
  type Booking,
  type Prisma,
} from "@generated/prisma/client.js";
import {
  EVENT_TYPES,
  KAFKA_TOPICS,
  RefundStatus,
  type BookingStatusChangedV1Type,
} from "@irctc/contracts";
import type { OutboxRepository } from "@irctc/kafka";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import type { BookingRepository } from "@repository";
import { ERROR_CODES } from "@utils/errors";

/**
 * Authoritative state machine transitions for the booking lifecycle.
 * Maps every BookingStatus to its allowed target statuses.
 */
export const BOOKING_VALID_TRANSITIONS: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  [BookingStatus.PENDING]: [
    BookingStatus.SEATS_HELD,
    BookingStatus.FAILED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.SEATS_HELD]: [
    BookingStatus.PAYMENT_PENDING,
    BookingStatus.CONFIRMING,
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
    BookingStatus.FAILED,
  ],
  [BookingStatus.PAYMENT_PENDING]: [
    BookingStatus.CONFIRMING,
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
    BookingStatus.FAILED,
  ],
  [BookingStatus.CONFIRMING]: [BookingStatus.CONFIRMED, BookingStatus.FAILED],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.CANCELLING,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CANCELLING]: [BookingStatus.CANCELLED, BookingStatus.FAILED],
  // Terminal states have no valid subsequent transitions
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.FAILED]: [],
};

/**
 * Permitted starting statuses eligible for user or automated cancellation.
 */
export const CANCELLABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.SEATS_HELD,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
];

/**
 * Parameters for performing an atomic booking status transition.
 */
export interface BookingTransitionParams {
  booking: Booking;
  target: BookingStatus;
  allowedFrom?: readonly BookingStatus[];
  updates?: Prisma.BookingUpdateInput;
}

/**
 * Transactional dependencies required for executing a booking transition.
 */
export interface TransitionContext {
  tx: Prisma.TransactionClient;
  bookingRepository: BookingRepository;
  outboxRepository: OutboxRepository;
}

/**
 * Atomically executes a booking state transition inside a database transaction client:
 * 1. Verifies transition validity against state machine rules or explicit allowedFrom list.
 * 2. Applies optional booking column updates.
 * 3. Executes atomic CAS update on status and version.
 * 4. Inserts a BookingStatusChangedV1 event into the transactional outbox.
 *
 * @param ctx - Transaction context containing tx client, booking repo, and outbox repo.
 * @param params - Transition parameters (source booking, target status, optional updates).
 * @returns The incremented version number on success.
 */
export async function executeBookingTransition(
  ctx: TransitionContext,
  params: BookingTransitionParams,
): Promise<{ newVersion: number }> {
  const { tx, bookingRepository, outboxRepository } = ctx;
  const { booking, target, allowedFrom, updates } = params;

  // 1. Validate transition legality
  if (allowedFrom && !allowedFrom.includes(booking.status)) {
    throw new ApiError(
      statusCode.conflict,
      ERROR_CODES.BOOKING_INVALID_TRANSITION,
      `Booking ${booking.id} in status ${booking.status} is not allowed to transition (expected one of: ${allowedFrom.join(", ")}).`,
    );
  }

  const validTargets = BOOKING_VALID_TRANSITIONS[booking.status];
  if (!validTargets?.includes(target)) {
    throw new ApiError(
      statusCode.conflict,
      ERROR_CODES.BOOKING_INVALID_TRANSITION,
      `Booking ${booking.id} cannot transition from ${booking.status} to ${target}.`,
    );
  }

  const newVersion = booking.version + 1;

  // 2. Apply optional column updates
  if (updates) {
    await bookingRepository.update(booking.id, updates, tx);
  }

  // 3. Atomic CAS status update
  const updated = await bookingRepository.updateStatus(
    booking.id,
    target,
    newVersion,
    tx,
  );

  if (!updated) {
    throw new ApiError(
      statusCode.conflict,
      ERROR_CODES.BOOKING_INVALID_TRANSITION,
      `Booking ${booking.id} status CAS failed — version ${booking.version} was stale.`,
    );
  }

  // 4. Emit BookingStatusChangedV1 outbox event
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

  await outboxRepository.insert(tx, {
    aggregateType: "Booking",
    aggregateId: booking.id,
    eventType: EVENT_TYPES.BOOKING_STATUS_CHANGED,
    topic: KAFKA_TOPICS.BOOKING_STATUS_CHANGED,
    payload: statusChangedPayload,
  });

  return { newVersion };
}

/**
 * Strongly-typed mapper from database SagaStatus to wire RefundStatus enum.
 *
 * @param status - Database SagaStatus.
 * @returns Contract RefundStatus enum value.
 */
export function mapSagaStatusToRefundStatus(status: SagaStatus): RefundStatus {
  switch (status) {
    case SagaStatus.COMPLETED:
      return RefundStatus.PROCESSED;
    case SagaStatus.FAILED:
      return RefundStatus.FAILED;
    case SagaStatus.PENDING:
    default:
      return RefundStatus.PENDING;
  }
}
