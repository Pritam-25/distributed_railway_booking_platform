import jwt from "jsonwebtoken";
import { env } from "@config";
import type { AccessTokenPayload, AuthUser } from "@irctc/middleware";

/**
 * Verifies a JWT signed with `JWT_SECRET` and returns the decoded user.
 *
 * Returns `null` on any failure (missing secret, invalid signature,
 * wrong `type`, missing claim) instead of throwing — the calling
 * middleware decides whether the absence of a token is an error
 * (required) or a no-op (optional).
 */
export const verifyAccessToken = (token: string): AuthUser | null => {
  if (!env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

    if (
      decoded.type !== "access" ||
      !decoded.sub ||
      !decoded.email ||
      !decoded.sessionId
    ) {
      return null;
    }

    return {
      userId: decoded.sub,
      email: decoded.email,
      sessionId: decoded.sessionId,
    };
  } catch {
    return null;
  }
};
