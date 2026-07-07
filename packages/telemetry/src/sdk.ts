import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";

import os from "node:os";

const DEPLOYMENT_ENVIRONMENT =
  process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";

/**
 * Shape of a resolved OTLP HTTP endpoint. We accept either:
 *   - a bare host (e.g. "http://otel-collector:4318") and append the default
 *     traces path, or
 *   - an explicit URL ending in `/v1/traces`.
 */
const DEFAULT_OTLP_TRACES_PATH = "/v1/traces";

/**
 * Options accepted by {@link startTelemetry}.
 *
 * + {@link serviceName} should match the `SERVICE_NAME` in the service's `env.ts`.
 * + {@link otlpEndpoint} is the base URL of the OTLP HTTP collector (no path).
 * + {@link serviceVersion} is the semantic version of the service. Defaults to `0.0.0`.
 * + {@link sampleRatio} is the sampling ratio (0.0 to 1.0) for traces. Defaults to 1.0 (always sample).
 * + {@link exporterTimeoutMillis} is the timeout for OTLP trace exports in milliseconds. Defaults to 5000.
 * + {@link serviceInstanceId} is the service instance ID. Defaults to process.env.HOSTNAME or host name.
 * + {@link debug} is a boolean to enable debug console logging for OpenTelemetry. Defaults to `false`.
 *
 * @example
 * ```ts
 * import { startTelemetry } from "@irctc/telemetry";
 * import { env } from "./env.js";
 *
 * const sdk = startTelemetry({
 *   serviceName: env.SERVICE_NAME,
 *   otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
 *   serviceVersion: "1.0.0",
 *   sampleRatio: 1,
 *   exporterTimeoutMillis: 5000,
 *   serviceInstanceId: "123e4567-e89b-12d3-a456-426614174000",
 *   debug: true,
 * });
 * ```
 */
export interface TelemetryOptions {
  serviceName: string;
  otlpEndpoint: string;
  serviceVersion?: string;
  sampleRatio?: number;
  exporterTimeoutMillis?: number;
  serviceInstanceId?: string;
  debug?: boolean;
}

/** Holds the singleton SDK instance so shutdown can reach it. */
let sdk: NodeSDK | null = null;

/** Set to true once `startTelemetry` has succeeded. */
let started = false;

/**
 * Build the canonical OTLP traces URL. We normalise trailing slashes and
 * append the standard `/v1/traces` path if the caller gave us a base URL.
 */
function resolveOtlpTracesUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error(
      "startTelemetry: 'otlpEndpoint' must be a non-empty absolute URL",
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      "startTelemetry: 'otlpEndpoint' must start with http:// or https://",
    );
  }
  if (trimmed.endsWith("/v1/traces")) return trimmed;
  return `${trimmed}${DEFAULT_OTLP_TRACES_PATH}`;
}

/**
 * Initialise the OpenTelemetry Node SDK with the project's standard set of
 * auto-instrumentations. Idempotent: a second call is a no-op so that
 * test suites that import multiple service entrypoints don't double-register
 * instrumentations.
 *
 * @param options - Service identity and OTLP endpoint.
 * @returns The started SDK, mainly useful for tests.
 */
export function startTelemetry(options: TelemetryOptions): NodeSDK {
  if (started) {
    return sdk as NodeSDK;
  }

  // Set up diagnostic logger if OTEL_DEBUG is "true" or debug option is passed
  if (options.debug || process.env.OTEL_DEBUG === "true") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const instanceId = options.serviceInstanceId ?? os.hostname();

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: options.serviceName,
    [ATTR_SERVICE_VERSION]: options.serviceVersion ?? "0.0.0",
    "deployment.environment": DEPLOYMENT_ENVIRONMENT,
    "service.instance.id": instanceId,
  });

  const traceExporter = new OTLPTraceExporter({
    url: resolveOtlpTracesUrl(options.otlpEndpoint),
    timeoutMillis: options.exporterTimeoutMillis ?? 5000,
  });

  const sampleRatio = options.sampleRatio ?? 1;
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(sampleRatio),
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    sampler,
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs is too noisy for service-level traces; the cost outweighs the
        // value once a service is past the bootstrap phase.
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
  started = true;

  return sdk;
}

/**
 * Flush pending spans and shut the SDK down. Services call this from their
 * graceful-shutdown sequence, AFTER the HTTP server has stopped accepting
 * new requests but BEFORE the process exits.
 *
 * Wrapped in `Promise.resolve` so callers can `await` it without checking
 * whether telemetry was ever started.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!started || !sdk) return;
  try {
    await sdk.shutdown();
  } finally {
    sdk = null;
    started = false;
  }
}

/**
 * Test-only escape hatch: reset the singleton guards so a fresh `startTelemetry`
 * call can be issued (e.g. when re-using a test harness across files). Never
 * call this from production code.
 */
export function __resetTelemetryForTests(): void {
  sdk = null;
  started = false;
}
