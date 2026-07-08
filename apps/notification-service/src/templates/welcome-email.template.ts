/**
 * Generates the HTML template for welcome emails.
 *
 * @param firstName - Recipient's first name.
 * @param lastName - Recipient's last name.
 * @param loggedInAt - Timestamp of the login session.
 * @returns The structured HTML email string.
 */
export function getWelcomeEmailTemplate(
  firstName: string,
  lastName: string,
  loggedInAt: Date,
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #198754; text-align: center;">Welcome Back!</h2>
      <p>Hello <strong>${firstName} ${lastName}</strong>,</p>
      <p>You have successfully logged into your IRCTC account.</p>
      <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; color: #555;">
        <strong>Login Time:</strong> ${loggedInAt.toLocaleString()}
      </div>
      <p>If you did not log in at this time, please contact our support team immediately.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">Distributed Railway Booking Platform &copy; 2026</p>
    </div>
  `;
}
