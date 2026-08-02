import type { Request } from "express";
import crypto from "node:crypto";

/**
 * Generates a stable device fingerprint hash from request metadata.
 *
 * @remarks
 * Combines the `User-Agent`, source IP, and `Accept` header into a
 * SHA-256 digest. The fingerprint is bound to the auth session so a
 * stolen refresh token presented from a different device is rejected.
 * @param req - The Express `Request` object.
 * @returns A SHA-256 hex digest representing the device fingerprint.
 */
export function getDeviceFingerprint(req: Request): string {
  const userAgent = req.headers["user-agent"] || "";
  const ip = req.ip || "";
  const accept = req.headers["accept"] || "";

  const raw = `${userAgent}|${ip}|${accept}`;

  return crypto.createHash("sha256").update(raw).digest("hex");
}
