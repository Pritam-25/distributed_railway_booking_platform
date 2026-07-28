import "../extend-zod.js";
import { z } from "zod";
import { MetaSchema } from "./meta.js";

/**
 * Pagination metadata block embedded in paginated response envelopes.
 *
 * Includes total counts and the resolved page window so clients can render
 * pagers without re-deriving totals from the data array length.
 */
export const PaginationMetadataSchema = z
  .object({
    total: z.number().int().openapi({ example: 100 }),
    page: z.number().int().openapi({ example: 1 }),
    limit: z.number().int().openapi({ example: 10 }),
    totalPages: z.number().int().openapi({ example: 10 }),
  })
  .openapi("PaginationMetadata");

/**
 * Generic Paginated Response Envelope Schema
 *
 * Shape: `{ success: true, message, data: T[], meta: ResponseMeta & PaginationMetadata }`.
 *
 * `meta` extends the base `MetaSchema` with pagination fields via `extend(...)`
 * so a single `$ref` to `MetaSchema` is preserved alongside the pagination
 * markers.
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
  messageExample: string = "Items retrieved successfully",
) =>
  z
    .object({
      success: z.literal(true).openapi({ example: true }),
      message: z.string().openapi({ example: messageExample }),
      data: z.array(itemSchema),
      meta: MetaSchema.extend(PaginationMetadataSchema.shape),
    })
    .openapi({ description: "Paginated Response Envelope" });
