"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ResetPasswordForm } from "@/app/(auth)/_components/resetPasswordForm"
import { PASSWORD_RESET_TOKEN_KEY } from "@/app/(auth)/_hooks"
import { Loader2 } from "lucide-react"

/**
 * Reads the password reset token from sessionStorage (set by the OTP
 * verification step) and renders the reset form. Redirects back to
 * `/forgot-password` if no valid token is found.
 *
 * Displays a loading UI while checking sessionStorage and during redirect
 * to avoid white-screen flashes.
 *
 * The token is removed from sessionStorage immediately after reading
 * so it cannot be replayed from another tab.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  /**
   * undefined => checking
   * null => no token, redirecting
   * string => token found, rendering form
   */
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const stored = sessionStorage.getItem(PASSWORD_RESET_TOKEN_KEY)
    if (!stored) {
      setToken(null)
      router.replace("/forgot-password")
      return
    }
    sessionStorage.removeItem(PASSWORD_RESET_TOKEN_KEY)
    setToken(stored)
  }, [router])

  // Display loading spinner while checking token or performing redirect
  if (token === undefined || token === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-md">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  )
}
