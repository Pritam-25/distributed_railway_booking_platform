import jwt from "jsonwebtoken";
import { env } from "@config";
import type { RefreshTokenPayload } from "@irctc/middleware";

/**
 * Safely verifies and decodes a JWT refresh token signature.
 *
 * @remarks
 * Returns `null` when the token is expired, malformed, or does not carry
 * the refresh-type claim. Never throws.
 * @param token - Raw JWT refresh token string to verify.
 * @returns Decoded {@link RefreshTokenPayload} on success, or `null` when
 *   verification fails.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as
      RefreshTokenPayload | undefined;

    if (decoded?.type === "refresh" && decoded.sub) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}
