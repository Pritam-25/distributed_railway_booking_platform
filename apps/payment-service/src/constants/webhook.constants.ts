/**
 * Razorpay Webhook Event constants.
 * Standardizes event names for payments, orders, and refunds across the payment-service.
 */
export const RAZORPAY_WEBHOOK_EVENTS = {
  // Order Events
  ORDER_PAID: "order.paid",

  // Payment Events
  PAYMENT_CAPTURED: "payment.captured",
  PAYMENT_FAILED: "payment.failed",

  // Refund Events
  REFUND_CREATED: "refund.created",
  REFUND_PROCESSED: "refund.processed",
  REFUND_FAILED: "refund.failed",
  REFUND_SPEED_CHANGED: "refund.speed_changed",
} as const;

export type RazorpayWebhookEvent =
  (typeof RAZORPAY_WEBHOOK_EVENTS)[keyof typeof RAZORPAY_WEBHOOK_EVENTS];
