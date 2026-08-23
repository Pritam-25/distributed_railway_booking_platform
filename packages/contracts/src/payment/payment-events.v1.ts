import { z } from "zod";

export const paymentOrderCreatedV1Schema = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  paymentOrderId: z.uuid(),
  razorpayOrderId: z.string(),
  amount: z.string(),
  currency: z.string().default("INR"),
  createdAt: z.coerce.date(),
});

export type PaymentOrderCreatedV1 = z.infer<typeof paymentOrderCreatedV1Schema>;

export const paymentSuccessV1Schema = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  paymentId: z.uuid(),
  paymentOrderId: z.uuid(),
  razorpayPaymentId: z.string(),
  amount: z.string(),
  source: z.enum(["CLIENT", "WEBHOOK"]),
  createdAt: z.coerce.date(),
});

export type PaymentSuccessV1 = z.infer<typeof paymentSuccessV1Schema>;

export const paymentFailedV1Schema = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  paymentOrderId: z.uuid(),
  reason: z.string(),
  createdAt: z.coerce.date(),
});

export type PaymentFailedV1 = z.infer<typeof paymentFailedV1Schema>;
