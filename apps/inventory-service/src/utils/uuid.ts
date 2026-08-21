import crypto from "node:crypto";

/**
 * Derives a deterministic RFC4122 UUID v4 format string from a seed string.
 * Ensures retries generate the exact same eventId for outbox event publication.
 *
 * @param seed - Seed string (e.g. `held:<eventId>`)
 * @returns Deterministic RFC4122 formatted UUID string.
 */
export function deriveDeterministicUuid(seed: string): string {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    `4${hash.substring(13, 16)}`,
    `8${hash.substring(17, 20)}`,
    hash.substring(20, 32),
  ].join("-");
}
