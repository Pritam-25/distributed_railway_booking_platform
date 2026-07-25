"use client"

import { useQuery } from "@tanstack/react-query"
import { getProfile } from "@/generated/endpoints/user-profile/user-profile"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Loader2, User, Train, ArrowRight } from "lucide-react"
import Link from "next/link"

export default function Page() {
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

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6 md:p-10">
      <div className="w-full max-w-md">
        {isLoading ? (
          <Card className="border-border/40 p-8 text-center shadow-sm">
            <CardContent className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Loading account information...
              </p>
            </CardContent>
          </Card>
        ) : isError || !user ? (
          <Card className="overflow-hidden border-border/40 shadow-md">
            <CardHeader className="pb-2 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Train className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">
                Railway Booking Platform
              </CardTitle>
              <CardDescription>
                Welcome to IRCTC Distributed Railway Booking System. Please log
                in or register an account.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              <Link href="/login" className="w-full">
                <Button className="w-full cursor-pointer">
                  Login to Account
                </Button>
              </Link>
              <Link href="/signup" className="w-full">
                <Button variant="outline" className="w-full cursor-pointer">
                  Create Account
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-border/40 shadow-md">
            <CardHeader className="pb-4 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Train className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">
                Welcome back, {user.firstName}!
              </CardTitle>
              <CardDescription>
                Signed in as{" "}
                <span className="font-medium text-foreground">
                  {user.email}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-2">
              <Link href="/profile" className="w-full">
                <Button className="w-full cursor-pointer gap-2">
                  <User className="h-4 w-4" />
                  Go to Account & Profile
                  <ArrowRight className="ml-auto h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
