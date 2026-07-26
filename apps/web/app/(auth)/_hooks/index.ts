/**
 * Barrel export for (auth) domain mutation hooks.
 *
 * Import everything from here instead of individual hook files:
 * @example
 * import { useLoginMutation, useSignupMutation } from "../_hooks"
 */

export { useLoginMutation } from "./useLoginMutation"
export { useSignupMutation } from "./useSignupMutation"
export { useForgotPasswordMutation } from "./useForgotPasswordMutation"
export { useVerifyOtpMutation } from "./useVerifyOtpMutation"
export { useVerifyPasswordResetOtpMutation } from "./useVerifyPasswordResetOtpMutation"
export { useResetPasswordMutation } from "./useResetPasswordMutation"
