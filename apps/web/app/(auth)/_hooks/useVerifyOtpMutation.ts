import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { verifyOtp, type VerifyOtpRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * Mutation hook for verifying the email OTP (registration step 2).
 *
 * On success, completes the registration flow and redirects to `/`.
 */
export function useVerifyOtpMutation() {
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: VerifyOtpRequest) => verifyOtp(payload),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Registration Complete",
          description: response.message || "Email verified successfully!",
        })
        router.push("/")
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
