import { useQuery } from "@tanstack/react-query"
import { getProfile } from "@/generated"
import { profileKeys } from "@/app/(protected)/profile/_hooks/keys"

export { profileKeys }

/**
 * Domain-level query hook for fetching the authenticated user's identity.
 * Serves as the single source of truth for the authentication guard.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: () => getProfile(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
  })
}
