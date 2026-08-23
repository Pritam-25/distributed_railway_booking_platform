import {
  createChannel,
  createClientFactory,
  type ClientFactory,
  type ClientMiddleware,
  type CompatServiceDefinition,
} from "nice-grpc";
import { createDeadlineMiddleware } from "./middlewares/deadline.middleware.js";
import { clientLoggingMiddleware } from "./middlewares/logging.middleware.js";
import { createInternalAuthClientMiddleware } from "./middlewares/auth.middleware.js";

export type GrpcClientAuthOptions =
  { mode: "none" } | { mode: "bearer"; token: string };

export interface CreateGrpcClientOptions {
  /**
   * Authentication configuration for outgoing gRPC client calls.
   * - `mode: "none"`: No authorization metadata sent.
   * - `mode: "bearer"`: Sends `authorization: Bearer <token>` metadata header.
   */
  auth?: GrpcClientAuthOptions;
  /**
   * Default timeout in milliseconds for gRPC calls.
   *
   * @default 3000
   */
  defaultTimeoutMs?: number;
  /**
   * Additional custom client middlewares to attach.
   */
  additionalMiddlewares?: ClientMiddleware[];
}

/**
 * Creates a reusable nice-grpc ClientFactory loaded with standard
 * deadline, logging, and optional authorization client middlewares.
 */
export function createGrpcClientFactory(
  options?: CreateGrpcClientOptions,
): ClientFactory {
  let factory = createClientFactory()
    .use(
      createDeadlineMiddleware({
        defaultTimeoutMs: options?.defaultTimeoutMs,
      }),
    )
    .use(clientLoggingMiddleware);

  if (options?.auth?.mode === "bearer") {
    factory = factory.use(
      createInternalAuthClientMiddleware(options.auth.token),
    );
  }

  if (options?.additionalMiddlewares) {
    for (const mw of options.additionalMiddlewares) {
      factory = factory.use(mw);
    }
  }

  return factory;
}

/**
 * Helper to construct a typed gRPC client and underlying Channel from a service definition and host address URL.
 */
export function createGrpcClient<Service extends CompatServiceDefinition>(
  definition: Service,
  address: string,
  options?: CreateGrpcClientOptions,
) {
  const channel = createChannel(address);
  const factory = createGrpcClientFactory(options);
  const client = factory.create(definition, channel);

  return { client, channel };
}
