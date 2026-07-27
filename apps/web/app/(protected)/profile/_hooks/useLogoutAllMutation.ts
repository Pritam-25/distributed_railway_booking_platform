import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { logoutAll } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * Mutation hook for logging out all active sessions.
 *
 * Clears the entire TanStack Query cache and redirects to `/login` on success.
 */
export function useLogoutAllMutation() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: () => logoutAll(),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Signed Out of All Devices",
          description: "You have been logged out from all active devices.",
        })
        queryClient.clear()
        router.push("/login")
      } else {
        toast.add({
          type: "error",
          title: "Action Failed",
          description:
            response.message || "Failed to log out from all devices.",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to log out from all devices."
      )
      toast.add({
        type: "error",
        title: "Action Failed",
        description: message,
      })
    },
  })
}
