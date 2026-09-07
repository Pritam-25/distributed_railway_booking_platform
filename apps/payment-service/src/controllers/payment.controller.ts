import type { Request, Response } from "express";
import { successResponse, statusCode } from "@irctc/http";
import {
  PaymentService,
  PaymentRefundService,
  WebhookProcessor,
} from "@services";
import type {
  VerifyPaymentDto,
  PaymentOrderIdParamDto,
  RefundPaymentRequestDto,
} from "@dto";

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer | string;
}

/**
 * HTTP Controller for payment verification, refunds, and webhook processing.
 */
export class PaymentController {
  /**
   * Initializes PaymentController.
   *
   * @param paymentService - PaymentService instance for checkout & verification.
   * @param refundService - PaymentRefundService instance for refund processing.
   * @param webhookProcessor - WebhookProcessor instance for routing external gateway events.
   */
  constructor(
    private readonly paymentService: PaymentService,
    private readonly refundService: PaymentRefundService,
    private readonly webhookProcessor: WebhookProcessor,
  ) {}

  /**
   * REST endpoint to verify Razorpay checkout signature.
   * Used by frontend modal on completion.
   *
   * @param req - Express Request object containing payment signature verification payload.
   * @param res - Express Response object.
   */
  async verifyPayment(req: Request, res: Response): Promise<void> {
    const body = req.body as VerifyPaymentDto;

    const result = await this.paymentService.verifyAndCapture({
      paymentOrderId: body.paymentOrderId,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
      source: "CLIENT",
    });

    res
      .status(statusCode.success)
      .json(successResponse("Payment verified successfully.", result));
  }

  /**
   * REST endpoint to initiate a payment refund directly via HTTP.
   *
   * @param req - Express Request object containing paymentOrderId param and optional body.
   * @param res - Express Response object returning 202 Accepted.
   */
  async refundPayment(req: Request, res: Response): Promise<void> {
    const { paymentOrderId } = req.params as unknown as PaymentOrderIdParamDto;
    const body = req.body as RefundPaymentRequestDto | undefined;

    const result = await this.refundService.initiateHttpRefund(
      paymentOrderId,
      body?.amount,
      body?.reason,
    );

    res
      .status(statusCode.accepted)
      .json(successResponse("Refund request accepted for processing.", result));
  }

  /**
   * Razorpay Webhook endpoint.
   *
   * @param req - Express Request object with rawBody populated for signature check.
   * @param res - Express Response object.
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers["x-razorpay-signature"] as string;

    const customReq = req as RequestWithRawBody;
    const rawBody =
      customReq.rawBody ||
      (Buffer.isBuffer(req.body) ? req.body : String(req.body));

    const result = await this.webhookProcessor.process(rawBody, signature);

    res.status(statusCode.success).json(result);
  }
}
