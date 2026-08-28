/* eslint-disable @typescript-eslint/no-namespace */
// Side-effect file: augments Express's global `Request`/`Response` types
// so consumers don't need `as any` casts when reading fields attached by
// our own middleware (request-id, structured logger, trace id).
//
// Loaded transitively through `@irctc/middleware`'s barrel — any code that
// imports from `@irctc/middleware` (directly or via a re-export) picks up
// these augmentations automatically.
//
// Keep this file in sync with the producers:
//   - `requestId.ts`     sets `req.requestId` and `req.logger`
//   - `requestLogger.ts` reads `req.requestId` and `req.logger`
//   - upstream trace-id middleware sets `X-Trace-Id` (we cache it on res
//     so the proxy can read it without re-parsing the header)

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
  namespace Express {
    interface Request {
      /** Auth user payload set by `authUser` middleware. */
      user?: { userId: string; email?: string; sessionId: string };
      /** Auth admin payload set by `authAdmin` middleware. */
      admin?: { adminId: string };
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
