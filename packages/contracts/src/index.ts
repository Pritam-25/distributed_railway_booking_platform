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
export type {
  HealthClient,
  HealthServiceImplementation,
  HealthCheckRequest,
  HealthCheckResponse,
  HealthListRequest,
  HealthListResponse,
} from "./generated/grpc/health/v1/health.js";
export {
  HealthDefinition,
  HealthCheckResponse_ServingStatus,
} from "./generated/grpc/health/v1/health.js";
