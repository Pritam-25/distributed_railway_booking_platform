import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { resetPassword, ResetPasswordRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * Mutation hook for setting a new password (forgot-password final step).
 *
 * Requires a valid `passwordResetToken` obtained from `useVerifyPasswordResetOtpMutation`.
 * On success, redirects to `/login`.
 */
export function useResetPasswordMutation() {
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: ResetPasswordRequest) => resetPassword(payload),
    onSuccess: (response) => {
      toast.add({
        type: "success",
        title: "Password Updated",
        description:
          response.message ||
          "Your password has been reset successfully! Please log in.",
      })
      router.push("/login")
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to reset password. Please try again."
      )
      toast.add({
        type: "error",
        title: "Reset Failed",
        description: message,
      })
    },
  })
}
