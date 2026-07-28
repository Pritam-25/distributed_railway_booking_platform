import "../extend-zod.js";
import type { z } from "zod";

/**
 * Wrap a Zod schema into an OpenAPI JSON response object.
 *
 * Produces the `{ description, content: { "application/json": { schema } } }`
 * shape expected by `@asteasolutions/zod-to-openapi`'s `responses` map. Centralised
 * here so every service produces byte-identical response containers — keeps the
 * redocly `join` diff small across services.
 */
export const createOpenApiResponse = (
  description: string,
  schema: z.ZodTypeAny,
) => ({
  description,
  content: {
    "application/json": {
      schema,
    },
  },
});
