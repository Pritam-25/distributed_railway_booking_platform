import { env } from "@config";
import { logger as irctcLogger } from "@irctc/logger";

/**
 * Service responsible for sending emails using the SendGrid API.
 * Employs native Node.js fetch to keep dependencies minimal.
 */
export class EmailService {
  /**
   * The specialized logger instance for EmailService operations.
   */
  private readonly logger = irctcLogger.child({ module: "email-service" });

  /**
   * Sends an email via SendGrid. Falls back to simulated mock logs
   * if the provided SendGrid API Key is default or invalid.
   *
   * @param to - The recipient's email address.
   * @param subject - The subject line of the email.
   * @param htmlContent - The email body in HTML format.
   * @returns A promise that resolves when the email has been successfully sent.
   * @throws {Error} - If the SendGrid API returns a non-2xx status code or request fails.
   */
  async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    const apiKey = env.SENDGRID_API_KEY;
    const sender = env.SENDGRID_SENDER;

    this.logger.info({ to, subject }, `Initiating email delivery to ${to}`);

    // If key is mock or invalid, simulate successful sending for development
    if (apiKey === "SG.mock_key" || !apiKey.startsWith("SG.")) {
      this.logger.info(
        { to, subject, htmlContent },
        "[MOCK EMAIL] Email delivery simulated successfully (SendGrid API key not configured).",
      );
      return;
    }

    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: to }],
            },
          ],
          from: { email: sender },
          subject: subject,
          content: [
            {
              type: "text/html",
              value: htmlContent,
            },
          ],
        }),
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        throw new Error(
          `SendGrid API returned status ${response.status}: ${responseBody}`,
        );
      }

      this.logger.info({ to, subject }, "Email delivered successfully.");
    } catch (error) {
      this.logger.error(
        { error, to, subject },
        "Failed to deliver email through SendGrid.",
      );
      throw error;
    }
  }
}
