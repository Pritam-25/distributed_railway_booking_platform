"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { logout } from "@/generated/endpoints/authentication/authentication"
import { useRouter } from "next/navigation"
import { toast } from "@/components/ui/toast"
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

interface ProfileCardProps {
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    createdAt: string
  }
}

export function ProfileCard({ user }: ProfileCardProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  const { mutate: handleLogout, isPending: isLoggingOut } = useMutation({
    mutationFn: () => logout(),
    onSuccess: (response) => {
      toast.add({
        type: "success",
        title: "Logged out",
        description:
          response.message || "You have been logged out successfully.",
      })
      queryClient.clear()
      router.push("/login")
    },
    onError: () => {
      queryClient.clear()
      router.push("/login")
    },
  })

  const initials =
    `${user.firstName?.charAt(0) || ""}${user.lastName?.charAt(0) || ""}`.toUpperCase()

  return (
    <div className="space-y-6">
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="border-b border-border/40 pb-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <Avatar
                size="lg"
                className="h-16 w-16 border-2 border-primary/20"
              >
                <AvatarFallback className="text-md bg-primary font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left">
                <CardTitle className="text-xl font-semibold">
                  {user.firstName} {user.lastName}
                </CardTitle>
                <CardDescription className="text-sm">
                  {user.email}
                </CardDescription>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditDialogOpen(true)}
                className="flex w-full cursor-pointer items-center justify-center gap-2 sm:w-auto"
              >
                <Edit className="h-4 w-4" />
                Edit Profile
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLogout()}
                disabled={isLoggingOut}
                className="flex w-full cursor-pointer items-center justify-center gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
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

        <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
          {/* Email Address */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Email Address
              </p>
              <p className="mt-0.5 text-sm font-medium">{user.email}</p>
            </div>
          </div>

          {/* Member Since */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Member Since
              </p>
              <p className="mt-0.5 text-sm font-medium">
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
