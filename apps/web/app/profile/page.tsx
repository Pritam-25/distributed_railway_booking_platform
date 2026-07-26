"use client"

import { Suspense } from "react"
import {
  ProfileSection,
  SessionsSection,
  ProfileSkeleton,
  SessionSkeleton,
} from "@/app/profile/_components"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function ProfilePage() {
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

        {/* Independent Suspense Boundary 1: Profile Details */}
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileSection />
        </Suspense>

        {/* Independent Suspense Boundary 2: Active Device Sessions */}
        <Suspense fallback={<SessionSkeleton />}>
          <SessionsSection />
        </Suspense>
      </div>
    </div>
  )
}
