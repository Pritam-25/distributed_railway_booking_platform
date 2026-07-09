import { logger as irctcLogger } from "@irctc/logger";
import type { EmailProvider, SendEmailOptions } from "../email-provider.js";
import sgMail from "@sendgrid/mail";

/**
 * Concrete Strategy implementation of EmailProvider that dispatches email messages via SendGrid's API.
 * Uses Constructor Dependency Injection to receive credentials.
 */
export class SendGridProvider implements EmailProvider {
  private readonly logger: typeof irctcLogger;
  private readonly apiKey: string;
  private readonly sender: string;

  /**
   * Constructs a new SendGridProvider instance.
   *
   * @param deps - The dependencies required to initialize the provider.
   * @param deps.apiKey - The API key for SendGrid.
   * @param deps.sender - The verified sender email address.
   * @param deps.logger - The parent logger instance to create a child context from.
   */
  constructor(deps: {
    apiKey: string;
    sender: string;
    logger: typeof irctcLogger;
  }) {
    this.apiKey = deps.apiKey;
    this.sender = deps.sender;
    this.logger = deps.logger.child({ module: "sendgrid-provider" });
    sgMail.setApiKey(this.apiKey);
  }

  /**
   * Dispatches an email to the specified recipient using SendGrid.
   *
   * @param options - The email configuration options, including recipient address and content.
   * @returns A promise that resolves when the email is successfully queued/sent by SendGrid.
   * @throws {Error} - If SendGrid API call fails.
   */
  async send(options: SendEmailOptions): Promise<void> {
    const { to, content } = options;

    const msg = {
      to,
      from: this.sender,
      subject: content.subject,
      text: content.text,
      html: content.html,
    };

    try {
      const SEND_TIMEOUT_MS = 10_000; // 10 seconds
      await Promise.race([
        sgMail.send(msg),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("SendGrid send timed out")),
            SEND_TIMEOUT_MS,
          ),
        ),
      ]);
      this.logger.info({ module: "email-sendgrid" }, "Email sent via SendGrid");
    } catch (err) {
      this.logger.error(
        { module: "email-sendgrid", err },
        "Failed to send email via SendGrid",
      );
      throw err;
    }
  }
}
