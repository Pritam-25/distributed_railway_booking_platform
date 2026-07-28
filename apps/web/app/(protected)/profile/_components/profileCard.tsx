"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { EditProfileDialog } from "./editProfileDialog"
import { Mail, Calendar, Edit, LogOut, Loader2 } from "lucide-react"
import { useLogoutMutation } from "@/app/(protected)/profile/_hooks"
import type { UserResponse } from "@/generated"

interface ProfileCardProps {
  user: UserResponse
}

export function ProfileCard({ user }: Readonly<ProfileCardProps>) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const { mutate: handleLogout, isPending: isLoggingOut } = useLogoutMutation()

  const initials =
    `${user.firstName?.charAt(0) || ""}${user.lastName?.charAt(0) || ""}`.toUpperCase()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your personal details and active login sessions.
        </p>
      </div>

      <Card className="border-border/40 shadow-sm">
        <CardHeader className="border-b border-border/40 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                size="lg"
                className="h-16 w-16 border-2 border-primary/20"
              >
                <AvatarFallback className="text-md bg-primary font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-xl font-semibold">
                    {user.firstName} {user.lastName}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsEditDialogOpen(true)}
                    className="h-7 w-7 cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit Profile"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    <span className="sr-only">Edit Profile</span>
                  </Button>
                </div>
                <CardDescription className="text-sm">
                  {user.email}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center justify-center sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLogout()}
                disabled={isLoggingOut}
                className="w-full cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sign Out
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:px-12">
          {/* Email Address */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
              <Mail className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Email Address
              </p>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
          </div>

          {/* Member Since */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Calendar className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Member Since
              </p>
              <p className="text-sm font-medium">
                {new Date(user.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <EditProfileDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        defaultValues={{
          firstName: user.firstName,
          lastName: user.lastName,
        }}
      />
    </div>
  )
}
