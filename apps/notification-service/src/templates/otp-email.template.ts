import type { SendEmailOptions } from "@email";

/**
 * Input arguments required to render the OTP verification email.
 */
export interface OtpEmailInput {
  email: string;
  otp: string;
}

/**
 * Renders the SendEmailOptions for an OTP verification email.
 * Decouples subject, text, and styled HTML generation from the notification service.
 *
 * @param input - The recipient and OTP code details.
 * @returns The populated SendEmailOptions object.
 */
export const renderOtpEmail = (input: OtpEmailInput): SendEmailOptions => {
  return {
    to: input.email,
    content: {
      subject: "Your IRCTC One-Time Password (OTP)",
      text:
        `Hello,\n\n` +
        `We received a request to access your IRCTC account. Use the following verification code to proceed:\n\n` +
        `OTP: ${input.otp}\n\n` +
        `This code is valid for 5 minutes. If you did not request this OTP, you can safely ignore this email.\n\n` +
        `Distributed Railway Booking Platform`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #0d6efd; text-align: center;">IRCTC Verification Code</h2>
          <p>Hello,</p>
          <p>We received a request to access your IRCTC account. Use the following verification code to proceed:</p>
          <div style="font-size: 24px; font-weight: bold; text-align: center; margin: 30px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; letter-spacing: 2px; color: #333;">
            ${input.otp}
          </div>
          <p style="color: #6c757d; font-size: 14px;">This code is valid for 5 minutes. If you did not request this OTP, you can safely ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">Distributed Railway Booking Platform &copy; 2026</p>
        </div>
      `,
    },
  };
};
