import {
  createChannel,
  createClientFactory,
  type ClientFactory,
  type ClientMiddleware,
  type CompatServiceDefinition,
} from "nice-grpc";
import { createDeadlineMiddleware } from "./middlewares/deadline.middleware.js";
import { clientLoggingMiddleware } from "./middlewares/logging.middleware.js";

export interface CreateGrpcClientFactoryOptions {
  /**
   * Default timeout in milliseconds for gRPC calls.
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
 * deadline and logging client middlewares.
 */
export function createGrpcClientFactory(
  options?: CreateGrpcClientFactoryOptions,
): ClientFactory {
  let factory = createClientFactory()
    .use(
      createDeadlineMiddleware({
        defaultTimeoutMs: options?.defaultTimeoutMs,
      }),
    )
    .use(clientLoggingMiddleware);

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
  options?: CreateGrpcClientFactoryOptions,
) {
  const channel = createChannel(address);
  const factory = createGrpcClientFactory(options);
  const client = factory.create(definition, channel);

  return { client, channel };
}
