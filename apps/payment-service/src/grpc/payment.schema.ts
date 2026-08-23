import { z } from "zod";

/**
 * Zod validation schema for gRPC `CreateOrderRequest` payload.
 */
export const createOrderRequestSchema = z.object({
  bookingId: z.uuid("bookingId must be a valid UUID"),
  userId: z.uuid("userId must be a valid UUID"),
  amount: z.coerce
    .number()
    .int(
      "Amount in minor units must be an integer (e.g. 125050 for 1250.50 INR)",
    )
    .positive("Amount must be greater than zero"),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code (e.g. INR)")
    .default("INR"),
});

/**
 * Zod validation schema for gRPC `GetOrderStatusRequest` payload.
 */
export const getOrderStatusRequestSchema = z.object({
  paymentOrderId: z.uuid("paymentOrderId must be a valid UUID"),
});

export type CreateOrderRequestDto = z.infer<typeof createOrderRequestSchema>;
export type GetOrderStatusRequestDto = z.infer<
  typeof getOrderStatusRequestSchema
>;
