import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  verifyPasswordResetOtp,
  type VerifyPasswordResetOtpRequest,
} from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"
import { PASSWORD_RESET_TOKEN_KEY } from "."

/**
 * Mutation hook for verifying the password reset OTP (forgot-password step 2).
 *
 * On success, extracts `passwordResetToken` from the response and redirects
 * to `/forgot-password/reset?token=...` for the final password reset step.
 */
export function useVerifyPasswordResetOtpMutation() {
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: VerifyPasswordResetOtpRequest) =>
      verifyPasswordResetOtp(payload),
    onSuccess: (response) => {
      toast.add({
        type: "success",
        title: "OTP Verified",
        description:
          response.message ||
          "OTP verified successfully. You can now set your new password.",
      })
      const resetToken = response.data.passwordResetToken
      sessionStorage.setItem(PASSWORD_RESET_TOKEN_KEY, resetToken)
      router.push("/forgot-password/reset")
    },
    onError: (error) => {
      const message = getErrorMessage(error, "Invalid or expired OTP code.")
      toast.add({
        type: "error",
        title: "Verification Failed",
        description: message,
      })
    },
  })
}
