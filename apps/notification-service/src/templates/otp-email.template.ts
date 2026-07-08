/**
 * Generates the HTML template for OTP verification emails.
 *
 * @param otp - The 6-digit One-Time Password verification code.
 * @returns The structured HTML email string.
 */
export function getOtpEmailTemplate(otp: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #0d6efd; text-align: center;">IRCTC Verification Code</h2>
      <p>Hello,</p>
      <p>We received a request to access your IRCTC account. Use the following verification code to proceed:</p>
      <div style="font-size: 24px; font-weight: bold; text-align: center; margin: 30px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; letter-spacing: 2px; color: #333;">
        ${otp}
      </div>
      <p style="color: #6c757d; font-size: 14px;">This code is valid for 5 minutes. If you did not request this OTP, you can safely ignore this email.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">Distributed Railway Booking Platform &copy; 2026</p>
    </div>
  `;
}
