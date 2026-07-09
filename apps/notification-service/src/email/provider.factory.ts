import { SendGridProvider } from "./providers/sendgrid.provider.js";
import { logger as irctcLogger } from "@irctc/logger";

/**
 * Supported email vendor options.
 */
export const EmailVendor = {
  SENDGRID: "SENDGRID",
} as const;

export type EmailVendor = (typeof EmailVendor)[keyof typeof EmailVendor];

/**
 * Dependencies required by the EmailProviderFactory to instantiate email providers.
 */
export interface EmailProviderFactoryDeps {
  apiKey: string;
  sender: string;
  logger: typeof irctcLogger;
}

/**
 * Factory Method implementation for creating email provider instances.
 * Centralizes instantiation logic based on the configured EmailVendor.
 */
export class EmailProviderFactory {
  /**
   * Instantiates a concrete EmailProvider matching the specified vendor name.
   *
   * @param vendor - The identifier of the email vendor.
   * @param deps - Required setup dependencies (API key, sender, logger).
   * @returns An instance of SendGridProvider (or future supported provider).
   * @throws {Error} - If the requested vendor is unsupported or invalid.
   */
  static create(
    vendor: EmailVendor,
    deps: EmailProviderFactoryDeps,
  ): SendGridProvider {
    if (vendor === EmailVendor.SENDGRID) {
      return new SendGridProvider({
        apiKey: deps.apiKey,
        sender: deps.sender,
        logger: deps.logger,
      });
    }
    throw new Error("Invalid email vendor");
  }
}
