import type { Request, Response, NextFunction } from "express";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  sessionId: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: "refresh";
}

export interface AuthUser {
  userId: string;
  email?: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      admin?: { adminId: string };
    }
  }
}

/**
 * Middleware that extracts user identity from trusted gateway headers
 * instead of performing JWT verification.
 *
 * In the zero-trust architecture, the API gateway is the single point
 * that validates JWTs and injects these headers:
 * - `X-User-Id`     — verified user identifier from JWT `sub` claim
 * - `X-Session-Id`  — verified session identifier from JWT payload
 * - `X-User-Email`  — verified user email from JWT payload
 *
 * The gateway also strips these headers from incoming client requests
 * to prevent spoofing, so downstream services can trust them.
 *
 * This middleware populates `req.user` from the trusted headers,
 * making it a drop-in replacement for any user-identity dependent route handlers.
 */
export const trustGatewayHeaders = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const userId = req.headers["x-user-id"];
  const sessionId = req.headers["x-session-id"];
  const email = req.headers["x-user-email"];

  // Normalize — headers can be string | string[] | undefined
  const normalizedUserId = Array.isArray(userId) ? userId[0] : userId;
  const normalizedSessionId = Array.isArray(sessionId)
    ? sessionId[0]
    : sessionId;
  const normalizedEmail = Array.isArray(email) ? email[0] : email;

  if (normalizedUserId && normalizedSessionId) {
    req.user = {
      userId: normalizedUserId,
      sessionId: normalizedSessionId,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
    };
  }

  next();
};
