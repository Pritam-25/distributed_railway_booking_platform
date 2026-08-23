import {
  type PaymentServiceClient,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type GetOrderStatusRequest,
  type GetOrderStatusResponse,
} from "@irctc/contracts";
import { mapGrpcClientErrorToApiError } from "@irctc/grpc";

/**
 * Adapter wrapping the low-level Payment gRPC client.
 * Translates gRPC responses and transport errors into application-level ApiErrors.
 */
export class PaymentAdapter {
  /**
   * Creates an instance of PaymentAdapter.
   *
   * @param client - Payment gRPC client.
   */
  constructor(private readonly client: PaymentServiceClient) {}

  /**
   * Calls `PaymentService.CreateOrder` over gRPC and returns the order details.
   *
   * @param params - Create order parameters.
   * @returns CreateOrderResponse containing paymentOrderId, razorpayOrderId, etc.
   * @throws {ApiError} 503 if payment-service is unreachable.
   */
  async createOrder(params: CreateOrderRequest): Promise<CreateOrderResponse> {
    try {
      return await this.client.createOrder(params);
    } catch (err) {
      throw mapGrpcClientErrorToApiError(
        err,
        "Failed to create payment order. Please try again shortly.",
      );
    }
  }

  /**
   * Calls `PaymentService.GetOrderStatus` over gRPC.
   *
   * @param params - Get order status parameters.
   * @returns GetOrderStatusResponse
   * @throws {ApiError} 503 if payment-service is unreachable.
   */
  async getOrderStatus(
    params: GetOrderStatusRequest,
  ): Promise<GetOrderStatusResponse> {
    try {
      return await this.client.getOrderStatus(params);
    } catch (err) {
      throw mapGrpcClientErrorToApiError(
        err,
        "Failed to retrieve payment order status. Please try again shortly.",
      );
    }
  }
}
