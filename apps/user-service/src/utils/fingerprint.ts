import type { Request } from "express";
import crypto from "node:crypto";

/**
 * Generates a unique fingerprint for the current device/browser session.
 * Based on User-Agent, IP address, and Accept headers.
 *
 * @param req - The Express Request object.
 * @returns A SHA-256 hash representing the device fingerprint.
 */
export function getDeviceFingerprint(req: Request): string {
  const userAgent = req.headers["user-agent"] || "";
  const ip = req.ip || "";
  const accept = req.headers["accept"] || "";

  const raw = `${userAgent}|${ip}|${accept}`;

  return crypto.createHash("sha256").update(raw).digest("hex");
}
