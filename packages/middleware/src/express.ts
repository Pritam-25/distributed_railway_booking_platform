import type { logger } from "@irctc/logger";

export interface AuthAdmin {
  adminId: string;
}

export interface AuthUser {
  userId: string;
  email?: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Auth user payload set by `authUser` middleware. */
      user?: AuthUser;
      /** Auth admin payload set by `authAdmin` middleware. */
      admin?: AuthAdmin;
      /** Correlation ID set by `requestIdMiddleware`. */
      requestId?: string;
      /** Child logger bound to this request's `requestId`. */
      logger?: typeof logger;
    }
    interface Response {
      /** Cached `X-Trace-Id` header value (set by upstream trace middleware). */
      traceId?: string;
    }
  }
}

export {};
