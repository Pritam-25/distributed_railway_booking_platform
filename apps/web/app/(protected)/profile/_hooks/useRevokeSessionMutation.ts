import { useMutation, useQueryClient } from "@tanstack/react-query"
import { revokeSession } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"
import { sessionKeys } from "./keys"

/**
 * Mutation hook for revoking a single session (log out a specific device).
 *
 * Invalidates `sessionKeys.all` on success so the session list re-fetches.
 */
export function useRevokeSessionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Device Signed Out",
          description:
            response.message ||
            "The selected device was logged out successfully.",
        })
        queryClient.invalidateQueries({ queryKey: sessionKeys.all })
      } else {
        toast.add({
          type: "error",
          title: "Failed to Log Out Device",
          description: response.message || "Failed to log out device.",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(error, "Failed to log out device.")
      toast.add({
        type: "error",
        title: "Failed to Log Out Device",
        description: message,
      })
    },
  })
}
