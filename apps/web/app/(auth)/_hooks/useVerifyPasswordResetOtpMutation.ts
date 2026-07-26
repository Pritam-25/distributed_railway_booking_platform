import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  verifyPasswordResetOtp,
  type VerifyPasswordResetOtpRequest,
} from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"

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
      if (response.success) {
        toast.add({
          type: "success",
          title: "OTP Verified",
          description:
            response.message ||
            "OTP verified successfully. You can now set your new password.",
        })
        const resetToken = response.data.passwordResetToken
        router.push(
          `/forgot-password/reset?token=${encodeURIComponent(resetToken)}`
        )
      } else {
        toast.add({
          type: "error",
          title: "Verification Failed",
          description: response.message || "Invalid or expired OTP",
        })
      }
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
