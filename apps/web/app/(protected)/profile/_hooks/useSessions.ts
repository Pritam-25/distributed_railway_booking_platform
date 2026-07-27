import { useQuery } from "@tanstack/react-query"
import { getSessions } from "@/generated"
import { sessionKeys } from "./keys"

export { sessionKeys }

/** Fetches all active sessions for the authenticated user. */
export function useSessions() {
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: () => getSessions(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
  })
}
