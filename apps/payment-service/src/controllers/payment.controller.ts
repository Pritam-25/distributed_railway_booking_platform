import type { Request, Response } from "express";
import { successResponse, statusCode } from "@irctc/http";
import { PaymentService } from "@services";
import type { VerifyPaymentDto } from "@dto";

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer | string;
}

/**
 * HTTP Controller for payment verification and webhook processing.
 */
export class PaymentController {
  /**
   * Initializes PaymentController.
   *
   * @param paymentService - PaymentService instance injected by the DI container.
   */
  constructor(private readonly paymentService: PaymentService) {}

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

    const result = await this.paymentService.handleWebhook(rawBody, signature);

    res.status(statusCode.success).json(result);
  }
}
