import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateProfile, UpdateProfileRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"
import { profileKeys } from "./keys"

/**
 * Mutation hook for updating the user's profile (first name / last name).
 *
 * Invalidates `profileKeys.all` on success so `useProfile` re-fetches automatically.
 *
 * @param onSuccess - Optional callback invoked after a successful update (e.g. close a dialog).
 */
export function useUpdateProfileMutation(onSuccess?: () => void) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: UpdateProfileRequest) => updateProfile(payload),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Profile Updated",
          description:
            response.message || "Your profile has been updated successfully.",
        })
        queryClient.invalidateQueries({ queryKey: profileKeys.all })
        onSuccess?.()
      } else {
        toast.add({
          type: "error",
          title: "Update Failed",
          description: response.message || "Failed to update profile.",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to update profile. Please try again."
      )
      toast.add({
        type: "error",
        title: "Update Failed",
        description: message,
      })
    },
  })
}
