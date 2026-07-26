"use client"

import { useQuery } from "@tanstack/react-query"
import { getProfile } from "@/generated/endpoints/user-profile/user-profile"
import { ProfileCard } from "./_components/profileCard"
import { SessionManager } from "./_components/sessionManager"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Loader2, ArrowLeft, ShieldAlert } from "lucide-react"
import Link from "next/link"

export default function ProfilePage() {
  // Fetch current user profile
  const {
    data: profileResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => getProfile(),
    retry: false,
  })

  const user = profileResponse?.data

  const renderContent = () => {
    if (isLoading) {
      return (
        <Card className="border-border/40 p-8 text-center shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading profile details...
            </p>
          </CardContent>
        </Card>
      )
    }

    if (isError || !user) {
      return (
        <Card className="overflow-hidden border-border/40 shadow-md">
          <CardHeader className="pb-2 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-6 w-6 text-amber-500" />
            </div>
            <CardTitle className="text-xl">Authentication Required</CardTitle>
            <CardDescription>
              You are currently not authenticated. Please log in to access this
              page.
            </CardDescription>
          </CardHeader>
          <CardContent className="mx-auto flex max-w-sm flex-col gap-3 pt-4">
            <Link href="/login" className="w-full">
              <Button className="w-full">Login to Account</Button>
            </Link>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Account Settings
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your personal details and active login sessions.
          </p>
        </div>

        {/* Profile Information (Top Card) */}
        <ProfileCard user={user} />

        {/* Active Device Sessions (Bottom Card) */}
        <SessionManager />
      </div>
    )
  }

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

        {renderContent()}
      </div>
    </div>
  )
}
