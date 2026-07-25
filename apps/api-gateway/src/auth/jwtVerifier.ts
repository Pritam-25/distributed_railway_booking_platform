import jwt from "jsonwebtoken";
import { env } from "@config";
import type { AccessTokenPayload, AuthUser } from "@irctc/middleware";

export interface VerifyAccessTokenResult {
  user: AuthUser | null;
  error?: "expired" | "invalid";
}

/**
 * Verifies a JWT signed with `JWT_SECRET` and returns the decoded user along with error details.
 *
 * Returns `{ user: null, error: 'expired' | 'invalid' }` on failure, allowing the middleware
 * to differentiate between expired tokens (which trigger refresh) and invalid/missing tokens.
 */
export const verifyAccessToken = (token: string): VerifyAccessTokenResult => {
  if (!env.JWT_SECRET) return { user: null, error: "invalid" };

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

    if (
      decoded.type !== "access" ||
      !decoded.sub ||
      !decoded.email ||
      !decoded.sessionId
    ) {
      return { user: null, error: "invalid" };
    }

    return {
      user: {
        userId: decoded.sub,
        email: decoded.email,
        sessionId: decoded.sessionId,
      },
    };
  } catch (error: unknown) {
    if (
      error instanceof jwt.TokenExpiredError ||
      (error instanceof Error && error.name === "TokenExpiredError")
    ) {
      return { user: null, error: "expired" };
    }
    return { user: null, error: "invalid" };
  }
};
