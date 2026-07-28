import "../extend-zod.js";
import { z } from "zod";
import { MetaSchema } from "./meta.js";

/**
 * Generic Success Response Envelope Schema
 *
 * Shape: `{ success: true, message, data, meta }` where `data` is supplied by
 * the caller. Used as the body of `200`/`201` responses across every service.
 *
 * The envelope schema is intentionally unnamed (`refId` is not set) so each
 * service emits a variant per content type — the orval transformer in
 * `apps/web/scripts/orval-transformer.ts` collapses these into a shared
 * `SuccessResponse` reference at SDK-generation time.
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
  messageExample: string = "Operation completed successfully",
) =>
  z
    .object({
      success: z.literal(true).openapi({ example: true }),
      message: z.string().openapi({ example: messageExample }),
      data: dataSchema,
      meta: MetaSchema,
    })
    .openapi({ description: "Success Response Envelope" });
