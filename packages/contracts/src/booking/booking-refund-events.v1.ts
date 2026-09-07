import { z } from "zod";
import { moneyRupeesSchema, currencySchema } from "../money/index.js";

/**
 * ## Booking Refund Requested
 *
 * Published by booking-service outbox when a `CONFIRMED` booking is cancelled
 * and a payment refund must be initiated. Consumed by payment-service's
 * `RefundRequestedConsumer`, which calls `refundPayment()`.
 *
 * ### Design notes
 * - The event carries all fields required to make the refund call deterministic;
 *   the payment-service does **not** need to look up the refund amount from the
 *   booking-service.
 * - `idempotencyKey` is passed as the Razorpay `X-Refund-Idempotency` header
 *   so that Kafka consumer retries after a timeout are safe.
 * - `sagaId` is the correlation ID that links this event to the cancellation
 *   saga and is echoed back in `PaymentRefundedV1` for reconciliation.
 *
 * ### Lifecycle
 * The outbox row is written inside the same transaction that transitions the
 * `Booking` to `CANCELLED` and creates the `REFUND_PAYMENT` saga log entry.
 */
export const BookingRefundRequestedV1 = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  /** Internal `Payment.id` — the payment-service's authoritative payment record. */
  paymentId: z.uuid(),
  /** Internal `PaymentOrder.id` — used to locate the Razorpay order. */
  paymentOrderId: z.uuid(),
  /** Refund amount as a canonical 2-decimal string in rupees (e.g. "1250.50"). */
  amount: moneyRupeesSchema,
  currency: currencySchema.default("INR"),
  /**
   * Stable idempotency key used as the Razorpay `X-Refund-Idempotency` header.
   * Must be regenerated per cancellation saga, not per retry — the same key
   * must be sent on every retry of the same refund attempt.
   */
  idempotencyKey: z.uuid(),
  reason: z.string(),
  /** Cancellation saga correlation ID. Echoed back in PaymentRefundedV1. */
  sagaId: z.uuid(),
  createdAt: z.coerce.date(),
});

export type BookingRefundRequestedV1Type = z.infer<
  typeof BookingRefundRequestedV1
>;

export enum RefundStatus {
  PROCESSED = "PROCESSED",
  PENDING = "PENDING",
  FAILED = "FAILED",
  REVERSED = "REVERSED",
}

/**
 * ## Payment Refunded
 *
 * Published by payment-service at each meaningful point in the refund lifecycle:
 * - Immediately after the Razorpay Refund API responds (status: PENDING or PROCESSED)
 * - After processing a `refund.processed` or `refund.failed` Razorpay webhook
 *
 * Consumed by booking-service's `RefundResultConsumer`, which delegates to
 * `BookingSagaOrchestrator.handlePaymentRefunded()` to update the
 * `REFUND_PAYMENT` saga step.
 *
 * ### Status semantics
 * | status     | Source                            | Saga action                 |
 * |------------|-----------------------------------|-----------------------------|
 * | PENDING    | Razorpay API response             | no-op                       |
 * | PROCESSED  | Razorpay API or refund.processed  | REFUND_PAYMENT → COMPLETED  |
 * | FAILED     | Razorpay error or refund.failed   | REFUND_PAYMENT → FAILED     |
 * | REVERSED   | Razorpay refund reversal          | REFUND_PAYMENT → FAILED     |
 *
 * ### Idempotency
 * The consuming saga handler is idempotent via Redis. Duplicate events (e.g.
 * webhook + API response both emitting PROCESSED) are safely de-duplicated on
 * `eventId`.
 *
 * ### Key field: razorpayRefundId
 * Razorpay's `rfnd_xxxxx` identifier is included so that it can be persisted
 * by any downstream consumer for reconciliation and customer support.
 */
export const PaymentRefundedV1 = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  /** Internal `Payment.id`. */
  paymentId: z.uuid(),
  paymentOrderId: z.uuid(),
  /** Internal `PaymentRefund.id`. */
  refundId: z.uuid(),
  /** Razorpay's refund identifier, e.g. "rfnd_Abc123". Essential for reconciliation. */
  razorpayRefundId: z.string(),
  amount: moneyRupeesSchema,
  currency: currencySchema.default("INR"),
  status: z.enum(RefundStatus),
  /** Cancellation saga correlation ID from the originating BookingRefundRequestedV1, or null for webhooks. */
  sagaId: z.uuid().nullable(),
  reason: z.string().optional(),
  createdAt: z.coerce.date(),
});

export type PaymentRefundedV1Type = z.infer<typeof PaymentRefundedV1>;
