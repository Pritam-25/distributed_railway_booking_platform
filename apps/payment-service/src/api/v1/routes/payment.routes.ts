import { Router } from "express";
import {
  asyncHandler,
  validateSchema,
  validateParams,
} from "@irctc/middleware";
import { PaymentContainer } from "@container";
import {
  verifyPaymentSchema,
  paymentOrderIdParamSchema,
  refundPaymentRequestSchema,
} from "@dto";

const router: Router = Router();

/**
 * Verify Razorpay payment signature from client checkout modal.
 * Endpoint: POST /api/v1/payments/verify
 */
router.post(
  "/verify",
  validateSchema(verifyPaymentSchema),
  asyncHandler((req, res) =>
    PaymentContainer.getInstance().paymentController.verifyPayment(req, res),
  ),
);

/**
 * Initiate a payment refund directly via HTTP.
 * Endpoint: POST /api/v1/payments/:paymentOrderId/refund
 */
router.post(
  "/:paymentOrderId/refund",
  validateParams(paymentOrderIdParamSchema),
  validateSchema(refundPaymentRequestSchema),
  asyncHandler((req, res) =>
    PaymentContainer.getInstance().paymentController.refundPayment(req, res),
  ),
);

/**
 * Webhook endpoint for Razorpay payment captured/failed events.
 * Endpoint: POST /api/v1/payments/webhook
 */
router.post(
  "/webhook",
  asyncHandler((req, res) =>
    PaymentContainer.getInstance().paymentController.handleWebhook(req, res),
  ),
);

export default router;
