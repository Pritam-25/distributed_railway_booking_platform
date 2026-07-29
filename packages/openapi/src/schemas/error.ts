import "../extend-zod.js";
import { z } from "zod";
import { MetaSchema } from "./meta.js";

/**
 * Standardized error detail block.
 *
 * Emitted as a named component (`ErrorDetail`) so every service that references
 * the same `code`/`message`/`details` shape uses the same component name. When
 * redocly `join`s per-service specs, identical definitions merge silently.
 */
export const ErrorDetailSchema = z
  .object({
    code: z.string().openapi({ example: "INVALID_INPUT" }),
    message: z.string().openapi({ example: "Invalid Request Input." }),
    details: z.unknown().optional(),
  })
  .openapi("ErrorDetail");

/**
 * Standard error response envelope.
 *
 * Shape: `{ success: false, error: ErrorDetail, meta: ResponseMeta }`.
 *
 * Registered once by every service registry so each spec emits a single
 * `ErrorResponse` component. Per-status variants (e.g. `BadRequestErrorResponse`)
 * are built by `createErrorResponseSchema` in `responses/error-responses.ts` and
 * carry an `x-sdk-ref: "ErrorResponse"` marker for the orval transformer.
 */
export const ErrorResponseSchema = z
  .object({
    success: z.literal(false).openapi({ example: false }),
    error: ErrorDetailSchema,
    meta: MetaSchema,
  })
  .openapi("ErrorResponse");
