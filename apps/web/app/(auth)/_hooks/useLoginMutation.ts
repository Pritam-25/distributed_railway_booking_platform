import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { login, type LoginRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"
import { profileKeys } from "@/app/profile/_hooks"

interface UseLoginMutationOptions {
  /** The path to redirect to after a successful login. Defaults to `/profile`. */
  redirectTarget?: string
}

/**
 * Mutation hook for user login.
 *
 * Handles success/error toasts, cache invalidation, and redirect.
 * Use this instead of calling `useMutation` directly in `LoginForm`.
 *
 * @example
 * const { mutate, isPending } = useLoginMutation({ redirectTarget: "/dashboard" })
 */
export function useLoginMutation({
  redirectTarget = "/profile",
}: UseLoginMutationOptions = {}) {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: LoginRequest) => login(payload),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Welcome back!",
          description: response.message || "Login successful.",
        })
        queryClient.invalidateQueries({ queryKey: profileKeys.all })
        router.push(redirectTarget)
      } else {
        toast.add({
          type: "error",
          title: "Login Error",
          description: response.message || "Invalid credentials",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(error, "Invalid email or password.")
      toast.add({
        type: "error",
        title: "Login Error",
        description: message,
      })
    },
  })
}
