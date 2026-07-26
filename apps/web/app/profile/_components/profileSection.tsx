"use client"

import { useProfile } from "../_hooks"
import { ProfileCard } from "./profileCard"
import { AuthRequired } from "./authRequired"
import { ProfileSkeleton } from "./profileSkeleton"

export function ProfileSection() {
  const { data: profileResponse, isLoading, isError } = useProfile()
  const user = profileResponse?.data

  if (isLoading) {
    return <ProfileSkeleton />
  }

  if (isError || !user) {
    return <AuthRequired />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your personal details and active login sessions.
        </p>
      </div>
      <ProfileCard user={user} />
    </div>
  )
}
