"use client"

import {
  ProfileCard,
  SessionsSection,
} from "@/app/(protected)/profile/_components"
import { useAuth } from "@/providers/authProvider"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

/**
 * ProfilePage
 *
 * Rendered within the (protected) route group layout.
 * Accesses authenticated user identity instantly via useAuth() context.
 */
export default function ProfilePage() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen justify-center bg-muted/30 px-4 py-10 md:px-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Top Navigation */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon-sm" className="cursor-pointer">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="text-sm font-medium text-muted-foreground">
            Back to Dashboard
          </span>
        </div>

        {/* Primary Profile Identity */}
        <ProfileCard user={user} />

        {/* Independent Feature Data: Active Device Sessions */}
        <SessionsSection />
      </div>
    </div>
  )
}
