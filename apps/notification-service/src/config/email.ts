import { env } from "./env.js";
import type { EmailVendor } from "../email/provider.factory.js";

/**
 * Gets the configured email vendor from environment variables.
 * Type-cast to EmailVendor since it's verified at startup.
 *
 * @returns The configured EmailVendor.
 */
export const getEmailVendor = (): EmailVendor => {
  return env.EMAIL_VENDOR as EmailVendor;
};
