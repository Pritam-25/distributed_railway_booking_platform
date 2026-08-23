import express, { Router } from "express";
import { asyncHandler, validateSchema } from "@irctc/middleware";
import { PaymentContainer } from "@container";
import { verifyPaymentSchema } from "@dto";

const router: Router = Router();
const rawBodyMiddleware = express.raw({ type: "application/json" });

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
 * Webhook endpoint for Razorpay payment captured/failed events.
 * Endpoint: POST /api/v1/payments/webhook
 */
router.post(
  "/webhook",
  rawBodyMiddleware,
  asyncHandler((req, res) =>
    PaymentContainer.getInstance().paymentController.handleWebhook(req, res),
  ),
);

export default router;
