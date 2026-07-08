import type { SendEmailOptions } from "@email";
import { OtpPurpose } from "@irctc/contracts";

/**
 * Input arguments required to render the OTP verification email.
 */
export interface OtpEmailInput {
  email: string;
  otp: string;
  purpose: OtpPurpose;
  ttlSeconds: number;
}

/**
 * Renders the SendEmailOptions for an OTP verification email.
 * Decouples subject, text, and styled HTML generation from the notification service.
 * Supports purpose-specific copy (e.g. registration vs password reset) and dynamic expiry messaging.
 *
 * @param input - The recipient, OTP code, purpose, and TTL configuration.
 * @returns The populated SendEmailOptions object.
 */
export const renderOtpEmail = (input: OtpEmailInput): SendEmailOptions => {
  const isForgotPassword = input.purpose === OtpPurpose.FORGOT_PASSWORD;
  const durationMinutes = Math.floor(input.ttlSeconds / 60);

  const subject = isForgotPassword
    ? "Reset your IRCTC password"
    : "Your IRCTC One-Time Password (OTP)";

  const header = isForgotPassword
    ? "IRCTC Password Reset Code"
    : "IRCTC Verification Code";

  const description = isForgotPassword
    ? "We received a request to reset the password for your IRCTC account. Use the following verification code to proceed:"
    : "We received a request to access your IRCTC account. Use the following verification code to proceed:";

  const text = isForgotPassword
    ? `Hello,\n\n${description}\n\nOTP: ${input.otp}\n\nThis code is valid for ${durationMinutes} minutes. If you did not request a password reset, you can safely ignore this email.\n\nDistributed Railway Booking Platform`
    : `Hello,\n\n${description}\n\nOTP: ${input.otp}\n\nThis code is valid for ${durationMinutes} minutes. If you did not request this OTP, you can safely ignore this email.\n\nDistributed Railway Booking Platform`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: ${isForgotPassword ? "#dc3545" : "#0d6efd"}; text-align: center;">${header}</h2>
      <p>Hello,</p>
      <p>${description}</p>
      <div style="font-size: 24px; font-weight: bold; text-align: center; margin: 30px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; letter-spacing: 2px; color: #333;">
        ${input.otp}
      </div>
      <p style="color: #6c757d; font-size: 14px;">This code is valid for ${durationMinutes} minutes. If you did not request this email, you can safely ignore it.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">Distributed Railway Booking Platform &copy; 2026</p>
    </div>
  `;

  return {
    to: input.email,
    content: {
      subject,
      text,
      html,
    },
  };
};
