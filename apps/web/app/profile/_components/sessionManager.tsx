"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getSessions,
  revokeSession,
  logoutAll,
} from "@/generated/endpoints/authentication/authentication"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Trash2,
  ShieldAlert,
  Loader2,
  RefreshCw,
  LogOut,
  Info,
} from "lucide-react"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"
import { getDeviceIcon, getDeviceName } from "@/lib/utils/device"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

export function SessionManager() {
  const queryClient = useQueryClient()
  const router = useRouter()

  const [confirmRevokeSessionId, setConfirmRevokeSessionId] = useState<
    string | null
  >(null)
  const [isLogoutAllConfirmOpen, setIsLogoutAllConfirmOpen] = useState(false)

  // Fetch active sessions
  const {
    data: sessionsResponse,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["user-sessions"],
    queryFn: () => getSessions(),
    retry: false,
  })

  // Revoke session mutation
  const {
    mutate: revokeMutation,
    variables: revokingSessionId,
    isPending: isRevokePending,
  } = useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Device Signed Out",
          description:
            response.message ||
            "The selected device was logged out successfully.",
        })
        queryClient.invalidateQueries({ queryKey: ["user-sessions"] })
      } else {
        toast.add({
          type: "error",
          title: "Failed to Log Out Device",
          description: response.message || "Failed to log out device.",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(error, "Failed to log out device.")
      toast.add({
        type: "error",
        title: "Failed to Log Out Device",
        description: message,
      })
    },
  })

  // Logout all sessions mutation
  const { mutate: logoutAllMutation, isPending: isLoggingOutAll } = useMutation(
    {
      mutationFn: () => logoutAll(),
      onSuccess: (response) => {
        if (response.success) {
          toast.add({
            type: "success",
            title: "Signed Out of All Devices",
            description: "You have been logged out from all active devices.",
          })
          queryClient.clear()
          router.push("/login")
        } else {
          toast.add({
            type: "error",
            title: "Action Failed",
            description:
              response.message || "Failed to log out from all devices.",
          })
        }
      },
      onError: (error) => {
        const message = getErrorMessage(
          error,
          "Failed to log out from all devices."
        )
        toast.add({
          type: "error",
          title: "Action Failed",
          description: message,
        })
      },
    }
  )

  const sessions = sessionsResponse?.data || []

  const renderSessionsContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading active devices...</p>
        </div>
      )
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-destructive">
          <ShieldAlert className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to retrieve devices</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )
    }

    if (sessions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
          <Info className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm">No active devices found.</p>
        </div>
      )
    }

    return (
      <div className="divide-y divide-border/40">
        {sessions.map((session) => {
          const Icon = getDeviceIcon(session.userAgent)
          const isCurrent = session.isCurrent
          const isRevoking =
            isRevokePending && revokingSessionId === session.sessionId

          return (
            <div
              key={session.sessionId}
              className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm leading-none font-medium">
                      {getDeviceName(session.userAgent)}
                    </p>
                    {isCurrent ? (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/20 dark:text-green-400">
                        Current Device
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    IP: {session.ipAddress} •{" "}
                    {(session as { location?: string }).location ||
                      "Unknown Location"}{" "}
                    • Active:{" "}
                    {new Date(session.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              {!isCurrent && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmRevokeSessionId(session.sessionId)}
                  disabled={isRevoking}
                  className="cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Log out device"
                >
                  {isRevoking ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Sessions Details Card */}
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">
              Active Sessions
            </CardTitle>
            <CardDescription className="text-xs">
              Devices currently signed into your IRCTC platform account.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
          </Button>
        </CardHeader>

        <CardContent className="p-0">{renderSessionsContent()}</CardContent>
        <CardFooter className="flex flex-col gap-4 border-t border-border/40 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" />
            </div>
            <span>
              Log out all active devices if you suspect unauthorized access.
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsLogoutAllConfirmOpen(true)}
            disabled={isLoggingOutAll}
            className="flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 sm:w-auto"
          >
            {isLoggingOutAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Sign Out of All Devices
          </Button>
        </CardFooter>
      </Card>

      {/* Alert Dialog for Revoking Session */}
      <AlertDialog
        open={confirmRevokeSessionId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRevokeSessionId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of this device?</AlertDialogTitle>
            <AlertDialogDescription>
              This device will be logged out of your account immediately. All
              data on this device will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/80"
              onClick={() => {
                if (confirmRevokeSessionId) {
                  revokeMutation(confirmRevokeSessionId)
                  setConfirmRevokeSessionId(null)
                }
              }}
            >
              Log Out Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog for Logout All */}
      <AlertDialog
        open={isLogoutAllConfirmOpen}
        onOpenChange={setIsLogoutAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of all devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will immediately log you out of all devices, including
              this current device. All data on these devices will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                buttonVariants({
                  variant: "destructive",
                  size: "sm",
                })
              )}
              onClick={() => {
                logoutAllMutation()
                setIsLogoutAllConfirmOpen(false)
              }}
            >
              Sign Out All Devices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
