/**
 * Barrel export for profile domain hooks.
 *
 * Import everything from here instead of individual hook files:
 * @example
 * import { useProfile, useUpdateProfileMutation, sessionKeys } from "../_hooks"
 */

// Query keys
export { profileKeys, sessionKeys } from "./keys"

// Queries
export { useSessions } from "./useSessions"

// Mutations
export { useUpdateProfileMutation } from "./useUpdateProfileMutation"
export { useLogoutMutation } from "./useLogoutMutation"
export { useLogoutAllMutation } from "./useLogoutAllMutation"
export { useRevokeSessionMutation } from "./useRevokeSessionMutation"
