import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { sendOtp, type RegisterRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * Mutation hook for user registration (step 1: send OTP).
 *
 * On success, redirects to `/verify-email` with the registered email as a
 * query param so the OTP form can display it.
 */
export function useSignupMutation() {
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: RegisterRequest) => sendOtp(payload),
    onSuccess: (response, variables) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "OTP Sent",
          description:
            response.message || "Verification code sent to your email.",
        })
        router.push(
          `/verify-email?email=${encodeURIComponent(variables.email)}`
        )
      } else {
        toast.add({
          type: "error",
          title: "Registration Error",
          description: response.message || "Failed to send OTP",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to send OTP. Please try again."
      )
      toast.add({
        type: "error",
        title: "Registration Error",
        description: message,
      })
    },
  })
}
