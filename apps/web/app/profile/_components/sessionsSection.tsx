"use client"

import { useSessions } from "../_hooks"
import { SessionManager } from "./sessionManager"
import { SessionSkeleton } from "./sessionSkeleton"

export function SessionsSection() {
  const { data: sessionsResponse, isLoading, isError } = useSessions()

  if (isLoading) {
    return <SessionSkeleton />
  }

  if (isError) {
    return null
  }

  const sessions = sessionsResponse?.data || []

  return <SessionManager sessions={sessions} />
}
