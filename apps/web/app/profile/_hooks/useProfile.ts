import { useQuery } from "@tanstack/react-query"
import { getProfile } from "@/generated"
import { profileKeys } from "./keys"

export { profileKeys }

/** Fetches the authenticated user's profile. */
export function useProfile() {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: () => getProfile(),
    retry: false,
  })
}
