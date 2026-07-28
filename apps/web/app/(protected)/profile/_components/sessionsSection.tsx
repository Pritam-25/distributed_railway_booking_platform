"use client"

import { SessionManager } from "./sessionManager"
import { SessionSkeleton } from "./sessionSkeleton"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"
import { useSessions } from "@/app/(protected)/profile/_hooks"

/**
 * Renders the active device sessions section.
 * Operates within an authenticated context — auth gating is handled by the parent page/layout.
 */
export function SessionsSection() {
  const {
    data: sessionsResponse,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useSessions()

  if (isLoading) {
    return <SessionSkeleton />
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/40 p-12 text-center text-destructive shadow-md">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Failed to load sessions</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const sessions = sessionsResponse?.data || []

  return (
    <SessionManager
      sessions={sessions}
      refetch={refetch}
      isRefetching={isRefetching}
    />
  )
}
