import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { logout } from "@/generated"
import { toast } from "@/components/ui/toast"

/**
 * Mutation hook for logging out the current session.
 *
 * Clears the entire TanStack Query cache and redirects to `/login`.
 * Even on API error, the cache is cleared and the user is redirected —
 * this ensures the UI always reflects the logged-out state.
 */
export function useLogoutMutation() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: () => logout(),
    onSuccess: (response) => {
      toast.add({
        type: "success",
        title: "Logged out",
        description:
          response.message || "You have been logged out successfully.",
      })
      queryClient.clear()
      router.push("/login")
    },
    onError: () => {
      // Clear cache and redirect even on error — best UX for logout
      queryClient.clear()
      router.push("/login")
    },
  })
}
