import { Metadata } from "nice-grpc";

export const METADATA_KEYS = {
  REQUEST_ID: "x-request-id",
  TRACE_ID: "x-trace-id",
  USER_ID: "x-user-id",
  AUTH_TOKEN: "authorization",
} as const;

const FORBIDDEN_HEADERS = new Set([
  "connection",
  "host",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "http2-settings",
  "te",
  "accept-encoding",
]);

/**
 * Creates a gRPC Metadata object initialized with trace and request headers.
 * Safely filters out HTTP-specific forbidden headers (e.g. connection, host, transfer-encoding).
 */
export function createRpcMetadata(
  headers: Record<string, string | undefined>,
): Metadata {
  const metadata = Metadata();
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (value !== undefined && !FORBIDDEN_HEADERS.has(lowerKey)) {
      try {
        metadata.set(lowerKey, String(value));
      } catch {
        // Ignore headers containing characters invalid for gRPC metadata
      }
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
