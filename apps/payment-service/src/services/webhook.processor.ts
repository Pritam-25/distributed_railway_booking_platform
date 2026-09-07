import { RAZORPAY_WEBHOOK_EVENTS } from "@constants";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";
import { verifyWebhookSignature } from "@utils";
import type { PaymentService } from "./payment.service.js";
import type { PaymentRefundService } from "./payment-refund.service.js";

/**
 * Webhook payload entity shape for Razorpay webhook parsing.
 */
export interface WebhookEntity {
  id?: string;
  order_id?: string;
  payment_id?: string;
  amount?: number;
  error_description?: string;
  error_code?: string;
  [key: string]: unknown;
}

export interface WebhookPayload {
  payment?: { entity?: WebhookEntity };
  order?: { entity?: WebhookEntity };
  refund?: { entity?: WebhookEntity };
  [key: string]: unknown;
}

export interface RazorpayWebhookBody {
  event: string;
  payload: WebhookPayload;
}

type WebhookHandler = (
  payload: WebhookPayload,
  signature: string,
) => Promise<void>;

/**
 * Strategy-based router for ingesting, validating, and dispatching Razorpay webhook events.
 *
 * Keeps cognitive complexity minimal (≤ 2 per method) by delegating domain logic directly
 * to PaymentService and PaymentRefundService.
 */
export class WebhookProcessor {
  private readonly handlers: Record<string, WebhookHandler>;

  /**
   * Initializes WebhookProcessor.
   *
   * @param paymentService - PaymentService instance for capture & failure handling.
   * @param refundService - PaymentRefundService instance for refund lifecycle & webhooks.
   */
  constructor(
    private readonly paymentService: PaymentService,
    private readonly refundService: PaymentRefundService,
  ) {
    this.handlers = {
      [RAZORPAY_WEBHOOK_EVENTS.PAYMENT_CAPTURED]: (p, sig) =>
        this.handlePaymentCaptured(p, sig),
      [RAZORPAY_WEBHOOK_EVENTS.ORDER_PAID]: (p, sig) =>
        this.handlePaymentCaptured(p, sig),
      [RAZORPAY_WEBHOOK_EVENTS.PAYMENT_FAILED]: (p) =>
        this.handlePaymentFailed(p),
      [RAZORPAY_WEBHOOK_EVENTS.REFUND_CREATED]: (p) =>
        this.handleRefundCreated(p),
      [RAZORPAY_WEBHOOK_EVENTS.REFUND_PROCESSED]: (p) =>
        this.handleRefundProcessed(p),
      [RAZORPAY_WEBHOOK_EVENTS.REFUND_FAILED]: (p) =>
        this.handleRefundFailed(p),
      [RAZORPAY_WEBHOOK_EVENTS.REFUND_SPEED_CHANGED]: () =>
        this.handleRefundSpeedChanged(),
    };
  }

  /**
   * Validates HMAC signature, parses webhook JSON payload, and routes to registered event handler.
   *
   * @param rawBody - Raw HTTP body string or Buffer.
   * @param signature - Signature from `x-razorpay-signature` header.
   * @returns Processing status summary.
   */
  async process(
    rawBody: string | Buffer,
    signature: string,
  ): Promise<{ status: string; event?: string }> {
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "Invalid webhook signature.",
      );
    }

    const body: RazorpayWebhookBody =
      typeof rawBody === "string"
        ? JSON.parse(rawBody)
        : JSON.parse(rawBody.toString("utf8"));

    const event = body.event;
    const payload = body.payload;

    logger.info(
      { module: "WebhookProcessor", event },
      "Razorpay webhook received.",
    );

    const handler = this.handlers[event];
    if (handler) {
      await handler(payload, signature);
    }

    return { status: "PROCESSED", event };
  }

  /**
   * Handles payment capture / order paid webhooks.
   */
  private async handlePaymentCaptured(
    payload: WebhookPayload,
    signature: string,
  ): Promise<void> {
    const entity = payload.payment?.entity || payload.order?.entity;
    if (!entity?.order_id || !entity?.id) return;

    await this.paymentService.verifyAndCapture({
      razorpayOrderId: entity.order_id,
      razorpayPaymentId: entity.id,
      razorpaySignature: signature,
      source: "WEBHOOK",
    });
  }

  /**
   * Handles payment failure webhooks.
   */
  private async handlePaymentFailed(payload: WebhookPayload): Promise<void> {
    const entity = payload.payment?.entity || payload.order?.entity;
    if (!entity?.order_id) return;

    const errorReason =
      entity.error_description ||
      entity.error_code ||
      "Payment failed at gateway";

    await this.paymentService.markAsFailed(entity.order_id, errorReason);
  }

  /**
   * Handles refund.created webhooks.
   */
  private async handleRefundCreated(payload: WebhookPayload): Promise<void> {
    const refundEntity = payload.refund?.entity;
    if (!refundEntity?.id) return;

    await this.refundService.handleRefundCreatedWebhook(refundEntity);
  }

  /**
   * Handles refund.processed webhooks.
   */
  private async handleRefundProcessed(payload: WebhookPayload): Promise<void> {
    const refundEntity = payload.refund?.entity;
    if (!refundEntity?.id) return;

    await this.refundService.handleRefundWebhook(refundEntity, "PROCESSED");
  }

  /**
   * Handles refund.failed webhooks.
   */
  private async handleRefundFailed(payload: WebhookPayload): Promise<void> {
    const refundEntity = payload.refund?.entity;
    if (!refundEntity?.id) return;

    await this.refundService.handleRefundWebhook(refundEntity, "FAILED");
  }

  /**
   * Handles refund.speed_changed webhooks (informational).
   */
  private async handleRefundSpeedChanged(): Promise<void> {
    logger.info(
      { module: "WebhookProcessor" },
      "Refund speed changed webhook received — metadata acknowledged.",
    );
  }
}
