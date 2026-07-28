/**
 * Barrel export for (auth) domain mutation hooks.
 *
 * Import everything from here instead of individual hook files:
 * @example
 * import { useLoginMutation, useSignupMutation } from "../_hooks"
 */

/**
 * sessionStorage key used to pass the password reset token between
 * the OTP-verification step and the reset-password page.
 */
export const PASSWORD_RESET_TOKEN_KEY = "passwordResetToken"

export { useLoginMutation } from "./useLoginMutation"
export { useSignupMutation } from "./useSignupMutation"
export { useForgotPasswordMutation } from "./useForgotPasswordMutation"
export { useVerifyOtpMutation } from "./useVerifyOtpMutation"
export { useVerifyPasswordResetOtpMutation } from "./useVerifyPasswordResetOtpMutation"
export { useResetPasswordMutation } from "./useResetPasswordMutation"
