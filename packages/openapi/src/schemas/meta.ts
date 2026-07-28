import "../extend-zod.js";
import { z } from "zod";

/**
 * Metadata block included in every API response envelope.
 *
 * Mirrors the `createMeta` shape produced by `@irctc/http` middleware. Every
 * success and error envelope in this package embeds this schema so generated
 * specs carry consistent request/trace identifiers and timestamps.
 */
export const MetaSchema = z
  .object({
    requestId: z
      .string()
      .openapi({ example: "3e3c1f1a-6f7d-4a2b-9b5c-1f0e3a4b5c6d" }),
    traceId: z
      .string()
      .openapi({ example: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }),
    timestamp: z.string().openapi({ example: "2026-07-24T11:21:35.000Z" }),
  })
  .openapi("ResponseMeta");
