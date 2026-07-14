import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { env } from "@config";
import { verifyAccessToken } from "./jwtVerifier.js";
import { COOKIE_NAMES } from "./cookieNames.js";
import { ERROR_MESSAGES } from "@utils";

/**
 * Headers injected by the gateway from a verified JWT.
 *
 * `x-user-id`, `x-user-email`, `x-session-id` are the only trusted
 * sources of identity for downstream services. Client-supplied values
 * are scrubbed on every request to prevent header-forgery.
 *
 * `x-admin-id` is a separate identity axis for admin-service traffic.
 */
const TRUSTED_USER_HEADERS = [
  "x-user-id",
  "x-user-email",
  "x-session-id",
] as const;

const TRUSTED_ADMIN_HEADERS = ["x-admin-id"] as const;

const ALL_TRUSTED_HEADERS = [
  ...TRUSTED_USER_HEADERS,
  ...TRUSTED_ADMIN_HEADERS,
] as const;

/**
 * Scrubs any client-supplied trusted identity headers. MUST be called
 * before injecting the verified values, otherwise a forged `x-user-id`
 * from the client could be picked up by the downstream.
 */
const scrubTrustedHeaders = (req: Request): void => {
  for (const key of Object.keys(req.headers)) {
    if ((ALL_TRUSTED_HEADERS as readonly string[]).includes(key)) {
      delete req.headers[key];
    }
  }
};

/**
 * Adds `X-User-Id` to the response `Vary` header (idempotently) so
 * caches and CDNs don't serve one user's response to another.
 */
const ensureVaryUserId = (res: Response): void => {
  const current = res.getHeader("Vary");
  let varyValue = "";
  if (Array.isArray(current)) {
    varyValue = current.join(",");
  } else if (typeof current === "string") {
    varyValue = current;
  }

  const parts = varyValue
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (!parts.some((v) => v.toLowerCase() === "x-user-id")) {
    parts.push("X-User-Id");
  }
  res.setHeader("Vary", parts.join(", "));
};

const ensureVaryAdminId = (res: Response): void => {
  const current = res.getHeader("Vary");
  let varyValue = "";
  if (Array.isArray(current)) {
    varyValue = current.join(",");
  } else if (typeof current === "string") {
    varyValue = current;
  }

  const parts = varyValue
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (!parts.some((v) => v.toLowerCase() === "x-admin-id")) {
    parts.push("X-Admin-Id");
  }
  res.setHeader("Vary", parts.join(", "));
};

/**
 * Required user auth — throws 401 if no valid access token is present.
 *
 * Token source: `Authorization: Bearer <token>` header first, then
 * the `access_token` cookie as a fallback for browser clients.
 */
export const gatewayAuthMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // 1. Scrub forged headers first so a downstream read cannot see them.
  scrubTrustedHeaders(req);

  // 2. Extract token (header → cookie).
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice("Bearer ".length).trim();
  }
  if (!token) {
    token = req.cookies?.[COOKIE_NAMES.accessToken] as string | undefined;
  }

  // 3. Verify.
  if (!token) {
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.UNAUTHORIZED,
      ERROR_MESSAGES.ACCESS_TOKEN_MISSING,
    );
  }

  const user = verifyAccessToken(token);
  if (!user) {
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.UNAUTHORIZED,
      ERROR_MESSAGES.ACCESS_TOKEN_INVALID,
    );
  }

  // 4. Inject verified identity.
  req.user = user;
  req.headers["x-user-id"] = user.userId;
  req.headers["x-user-email"] = user.email;
  req.headers["x-session-id"] = user.sessionId;

  ensureVaryUserId(res);
  next();
};

/**
 * Scrub-only middleware — strips any client-supplied trusted identity
 * headers and injects NOTHING. Used on routes where auth is `none`
 * (e.g. `/api/v1/auth/login`) so that a malicious client cannot pass
 * forged `x-user-id` and trick user-service into trusting it.
 */
export const scrubOnlyMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  for (const key of Object.keys(req.headers)) {
    if ((ALL_TRUSTED_HEADERS as readonly string[]).includes(key)) {
      delete req.headers[key];
    }
  }
  next();
};

/**
 * Optional user auth — does not throw when the token is missing or
 * invalid. Used on routes like `/api/v1/auth/login` and
 * `/api/v1/auth/refresh` where the body is the credential.
 *
 * If a valid token IS supplied, it is treated exactly as in
 * `gatewayAuthMiddleware` (headers injected, `Vary` set).
 */
export const optionalGatewayAuthMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  scrubTrustedHeaders(req);

  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice("Bearer ".length).trim();
  }
  if (!token) {
    token = req.cookies?.[COOKIE_NAMES.accessToken] as string | undefined;
  }

  if (token) {
    const user = verifyAccessToken(token);
    if (user) {
      req.user = user;
      req.headers["x-user-id"] = user.userId;
      req.headers["x-user-email"] = user.email;
      req.headers["x-session-id"] = user.sessionId;
      ensureVaryUserId(res);
    }
    // If token is present but invalid, fall through silently —
    // the route will decide what to do (e.g. 401 for refresh on
    // an expired token is handled by user-service).
  }

  next();
};

/**
 * Required admin auth — throws 401 if no valid admin access token.
 * Separate cookie (`admin_access_token`) and a separate `X-Admin-Id`
 * identity axis from regular users.
 */
export const gatewayAdminAuthMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  scrubTrustedHeaders(req);

  const token = req.cookies?.[COOKIE_NAMES.adminAccessToken] as
    string | undefined;

  if (!token) {
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.UNAUTHORIZED,
      ERROR_MESSAGES.ADMIN_ACCESS_TOKEN_MISSING,
    );
  }

  // Admin tokens share the JWT secret but are not user tokens —
  // verify against the same secret and expect an `adminId` claim.
  // (Real admin verification lives in admin-service; this is just
  // a presence + signature check at the gateway edge.)
  if (!token || token.split(".").length !== 3) {
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.UNAUTHORIZED,
      ERROR_MESSAGES.ADMIN_ACCESS_TOKEN_INVALID,
    );
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      sub?: string;
      type?: string;
    };

    if (decoded.type !== "admin" || !decoded.sub) {
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.UNAUTHORIZED,
        ERROR_MESSAGES.ADMIN_ACCESS_TOKEN_INVALID,
      );
    }

    req.admin = { adminId: decoded.sub };
    req.headers["x-admin-id"] = decoded.sub;
    ensureVaryAdminId(res);
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.UNAUTHORIZED,
      ERROR_MESSAGES.ADMIN_ACCESS_TOKEN_INVALID,
    );
  }
};
