import {
  GetOrderStatusResponse_Status,
  type PaymentServiceImplementation,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type GetOrderStatusRequest,
  type GetOrderStatusResponse,
} from "@irctc/contracts";
import { PaymentService } from "@services";
import { logger } from "@irctc/logger";
import {
  createOrderRequestSchema,
  getOrderStatusRequestSchema,
} from "./payment.schema.js";

/**
 * gRPC handler implementation for PaymentService definition.
 */
export class PaymentGrpcHandler implements PaymentServiceImplementation {
  /**
   * Initializes PaymentGrpcHandler.
   *
   * @param paymentService - PaymentService instance.
   */
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Handles gRPC `CreateOrder` RPC.
   *
   * @param request - CreateOrderRequest payload.
   * @returns CreateOrderResponse payload.
   */
  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    const validated = createOrderRequestSchema.parse(request);

    logger.info(
      { module: "grpc.handler", bookingId: validated.bookingId },
      "gRPC CreateOrder received.",
    );

    const result = await this.paymentService.createOrder({
      bookingId: validated.bookingId,
      userId: validated.userId,
      amount: validated.amount,
      currency: validated.currency,
    });

    logger.info(
      {
        module: "grpc.handler",
        paymentOrderId: result.paymentOrderId,
        razorpayOrderId: result.razorpayOrderId,
        status: result.status,
      },
      "gRPC CreateOrder response.",
    );

    return {
      paymentOrderId: result.paymentOrderId,
      razorpayOrderId: result.razorpayOrderId,
      keyId: result.keyId,
      status: result.status,
    };
  }

  /**
   * Handles gRPC `GetOrderStatus` RPC.
   *
   * @param request - GetOrderStatusRequest payload.
   * @returns GetOrderStatusResponse payload.
   */
  async getOrderStatus(
    request: GetOrderStatusRequest,
  ): Promise<GetOrderStatusResponse> {
    const validated = getOrderStatusRequestSchema.parse(request);

    logger.info(
      { module: "grpc.handler", paymentOrderId: validated.paymentOrderId },
      "gRPC GetOrderStatus received.",
    );

    const status = await this.paymentService.getStatus(
      validated.paymentOrderId,
    );

    return {
      paymentOrderId: status.paymentOrderId,
      razorpayOrderId: status.razorpayOrderId,
      razorpayPaymentId: status.razorpayPaymentId,
      status: GetOrderStatusResponse_Status.CAPTURED,
      amount: status.amount,
      currency: status.currency,
    };
  }
}
