/**
 * Shared query key factories for all profile and session queries/mutations.
 *
 * Import these in hooks to keep query keys consistent across
 * `useQuery`, `useMutation`, and `queryClient.invalidateQueries`.
 */

/** Query key for the authenticated user's profile. */
export const profileKeys = {
  all: ["user-profile"] as const,
}

/** Query key for the authenticated user's active sessions. */
export const sessionKeys = {
  all: ["user-sessions"] as const,
}
