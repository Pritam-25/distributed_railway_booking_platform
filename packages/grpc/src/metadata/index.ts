import { Metadata } from "nice-grpc";

export const METADATA_KEYS = {
  REQUEST_ID: "x-request-id",
  TRACE_ID: "x-trace-id",
  USER_ID: "x-user-id",
  AUTH_TOKEN: "authorization",
} as const;

/**
 * Creates a gRPC Metadata object initialized with trace and request headers.
 */
export function createRpcMetadata(
  headers: Record<string, string | undefined>,
): Metadata {
  const metadata = Metadata();
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      metadata.set(key, value);
    }
  }
  return metadata;
}

/**
 * Helper to retrieve a string header from a CallContext metadata object.
 */
export function getRpcMetadataValue(
  metadata: Metadata,
  key: string,
): string | undefined {
  const val = metadata.get(key);
  if (!val) return undefined;
  return Array.isArray(val) ? val[0] : val.toString();
}
