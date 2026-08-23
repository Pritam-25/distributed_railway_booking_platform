import { z } from "zod";

/**
 * Zod validation schema for POST /api/v1/payments/verify request body.
 */
export const verifyPaymentSchema = z.object({
  paymentOrderId: z.uuid().optional(),
  razorpayOrderId: z.string().min(1, "razorpayOrderId is required"),
  razorpayPaymentId: z.string().min(1, "razorpayPaymentId is required"),
  razorpaySignature: z.string().min(1, "razorpaySignature is required"),
});

export type VerifyPaymentDto = z.infer<typeof verifyPaymentSchema>;

/**
 * Zod validation schema for payment order ID URL parameters.
 */
export const paymentOrderIdParamSchema = z.object({
  paymentOrderId: z.uuid("Invalid paymentOrderId format"),
});

export type PaymentOrderIdParamDto = z.infer<typeof paymentOrderIdParamSchema>;
