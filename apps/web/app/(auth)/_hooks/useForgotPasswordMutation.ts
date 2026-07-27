import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { forgotPassword, type ForgotPasswordRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * Mutation hook for requesting a password reset OTP. (forgot-password step 1)
 *
 * On success, extracts `sessionId` from the response and redirects to `/forgot-password/verify?email=<email>&sessionId=<sessionId>` with
 * `email` and `sessionId` query params required by the OTP verification step.
 */
export function useForgotPasswordMutation() {
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: ForgotPasswordRequest) => forgotPassword(payload),
    onSuccess: (response, variables) => {
      toast.add({
        type: "success",
        title: "OTP Sent",
        description:
          response.message || "Verification code sent to your email.",
      })
      const sessionId = response.data.sessionId
      router.push(
        `/forgot-password/verify?email=${encodeURIComponent(variables.email)}&sessionId=${encodeURIComponent(sessionId)}`
      )
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to send reset code. Please try again."
      )
      toast.add({
        type: "error",
        title: "Request Error",
        description: message,
      })
    },
  })
}
