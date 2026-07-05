import type { RequestHandler } from "express";

/**
 * Helper to wrap async request handlers in a try-catch and pass errors to the next middleware.
 * @param fn Async request handler to wrap
 * @returns Wrapped request handler
 */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
