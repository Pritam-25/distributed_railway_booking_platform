export type {
  Server,
  Channel,
  CallContext,
  ServerMiddlewareCall,
  ClientMiddlewareCall,
} from "nice-grpc";

export {
  ServerError,
  ClientError,
  Status,
  Metadata,
  createChannel,
} from "nice-grpc";

/**
 * Diagnostic result produced by an individual gRPC health probe function.
 */
export interface GrpcHealthProbeResult {
  /** Whether the dependency probe succeeded. */
  ok: boolean;
  /** Latency of probe execution in milliseconds. */
  latencyMs: number;
  /** Optional error message detailing probe failure root cause. */
  error?: string;
}

/**
 * Health dependency probe adapter for gRPC readiness checks.
 */
export interface GrpcHealthDependency {
  /** Name identifier of the dependency probe. */
  name: string;
  /** Async probe handler executing readiness check against the underlying system. */
  check: () => Promise<GrpcHealthProbeResult>;
}

/**
 * Options for initializing gRPC health check handlers.
 */
export interface GrpcHealthOptions {
  /** Array of active dependency health probes. */
  dependencies?: GrpcHealthDependency[];
}
