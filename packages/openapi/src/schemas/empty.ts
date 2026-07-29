import "../extend-zod.js";
import { z } from "zod";

/**
 * Reusable schema for empty JSON object payloads `{}`.
 *
 * Used for endpoints that return a success envelope but no data — logout,
 * password reset, and similar no-content operations.
 */
export const EmptySchema = z.object({}).openapi("EmptyResponse");
