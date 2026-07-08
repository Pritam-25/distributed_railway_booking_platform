import type { SendEmailOptions } from "@email";

/**
 * Input arguments required to render the welcome email.
 */
export interface WelcomeEmailInput {
  email: string;
  firstName: string;
  lastName: string;
  loggedInAt: Date;
}

/**
 * Safely escapes HTML special characters from a user-controlled string to prevent HTML/XSS injection.
 *
 * @param value - The input string to escape.
 * @returns The HTML-safe escaped string.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] || char;
  });
}

/**
 * Renders the SendEmailOptions for a welcome email.
 * Decouples subject, text, and styled HTML generation from the notification service.
 *
 * @param input - The recipient and session details.
 * @returns The populated SendEmailOptions object.
 */
export const renderWelcomeEmail = (
  input: WelcomeEmailInput,
): SendEmailOptions => {
  const safeFirstName = escapeHtml(input.firstName);
  const safeLastName = escapeHtml(input.lastName);
  const timestamp = input.loggedInAt.toISOString();

  return {
    to: input.email,
    content: {
      subject: `Welcome back, ${input.firstName}`,
      text:
        `Hi ${input.firstName},\n\n` +
        `You have successfully signed in to your IRCTC account at ${timestamp} UTC. ` +
        `If this was not you, please reset your password immediately.\n\n` +
        `Safe travels,\nThe IRCTC Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #198754; text-align: center;">Welcome Back!</h2>
          <p>Hello <strong>${safeFirstName} ${safeLastName}</strong>,</p>
          <p>You have successfully logged into your IRCTC account.</p>
          <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; color: #555;">
            <strong>Login Time:</strong> ${timestamp} UTC
          </div>
          <p>If this was not you, please reset your password immediately.</p>
          <p>Safe travels,<br/>The IRCTC Team</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">Distributed Railway Booking Platform &copy; 2026</p>
        </div>
      `,
    },
  };
};
