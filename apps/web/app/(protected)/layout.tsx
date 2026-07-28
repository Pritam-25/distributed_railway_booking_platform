"use client"

import { useCurrentUser } from "@/hooks/useCurrentUser"
import { AuthProvider } from "@/providers/authProvider"
import { AuthRequired } from "@/app/(protected)/profile/_components/authRequired"
import { isUnauthorizedError } from "@/lib/utils/error"
import { Button } from "@/components/ui/button"
import { AlertCircle, Loader2 } from "lucide-react"

/**
 * ProtectedLayout (AuthGuard)
 *
 * Single infrastructure owner of authentication state for all protected routes.
 * Decouples individual pages and components from authentication gating logic.
 */
export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const {
    data: profileResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useCurrentUser()
  const user = profileResponse?.data

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (isError && isUnauthorizedError(error)) {
    return (
      <div className="flex min-h-screen justify-center bg-muted/30 px-4 py-10 md:px-8">
        <div className="w-full max-w-2xl space-y-6">
          <AuthRequired />
        </div>
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10 md:px-8">
        <div className="flex max-w-md flex-col items-center justify-center gap-3 rounded-lg border border-border/40 bg-background p-12 text-center text-destructive shadow-md">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load account details</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider user={user} refetch={refetch}>
      {children}
    </AuthProvider>
  )
}
