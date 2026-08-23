export * from "./user/index.js";
export * from "./kafka/index.js";
export * from "./admin/index.js";
export * from "./booking/index.js";
export * from "./payment/index.js";

export type {
  CreateOrderRequest,
  CreateOrderResponse,
  GetOrderStatusRequest,
  GetOrderStatusResponse,
  PaymentServiceClient,
  PaymentServiceImplementation,
} from "./generated/irctc/payment/v1/payment.js";
export { PaymentServiceDefinition } from "./generated/irctc/payment/v1/payment.js";

export * from "./generated/irctc/inventory/v1/inventory.js";
