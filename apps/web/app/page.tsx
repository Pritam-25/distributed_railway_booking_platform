"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getProfile } from "@/generated/endpoints/user-profile/user-profile"
import { logout } from "@/generated/endpoints/authentication/authentication"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Loader2, LogOut, CheckCircle2, ShieldAlert } from "lucide-react"
import Link from "next/link"
import { toast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"

export default function Page() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Fetch current user profile from GET /api/v1/users/me
  const {
    data: profileResponse,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => getProfile(),
    retry: false,
  })

  // Logout mutation
  const { mutate: handleLogout, isPending: isLoggingOut } = useMutation({
    mutationFn: () => logout(),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Logged out",
          description: "You have been logged out successfully.",
        })
        queryClient.invalidateQueries({ queryKey: ["user-profile"] })
        router.push("/login")
      }
    },
    onError: () => {
      toast.add({
        type: "error",
        title: "Logout Error",
        description: "Failed to logout. Please try again.",
      })
    },
  })

  const user = profileResponse?.data

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6 md:p-10">
      <div className="w-full max-w-md">
        {isLoading ? (
          <Card className="p-8 text-center">
            <CardContent className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Checking authentication state...
              </p>
            </CardContent>
          </Card>
        ) : isError || !user ? (
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                <ShieldAlert className="h-6 w-6 text-amber-500" />
              </div>
              <CardTitle className="text-xl">Not Logged In</CardTitle>
              <CardDescription>
                You are currently not authenticated. Please log in or create an
                account to access the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              <Link href="/login" className="w-full">
                <Button className="w-full">Login to Account</Button>
              </Link>
              <Link href="/signup" className="w-full">
                <Button variant="outline" className="w-full">
                  Create Account
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                    {user.firstName?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      {user.firstName} {user.lastName}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {user.email}
                    </CardDescription>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Authenticated
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b py-1.5 text-xs">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono text-muted-foreground">
                    {user.id}
                  </span>
                </div>
                <div className="flex justify-between border-b py-1.5 text-xs">
                  <span className="text-muted-foreground">First Name</span>
                  <span className="font-medium">{user.firstName}</span>
                </div>
                <div className="flex justify-between border-b py-1.5 text-xs">
                  <span className="text-muted-foreground">Last Name</span>
                  <span className="font-medium">{user.lastName}</span>
                </div>
                <div className="flex justify-between border-b py-1.5 text-xs">
                  <span className="text-muted-foreground">Email Address</span>
                  <span className="font-medium">{user.email}</span>
                </div>
                <div className="flex justify-between border-b py-1.5 text-xs">
                  <span className="text-muted-foreground">Joined At</span>
                  <span className="font-medium">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => refetch()}
                >
                  Refresh State
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 gap-2"
                  disabled={isLoggingOut}
                  onClick={() => handleLogout()}
                >
                  {isLoggingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <LogOut className="h-4 w-4" />
                      Logout
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
