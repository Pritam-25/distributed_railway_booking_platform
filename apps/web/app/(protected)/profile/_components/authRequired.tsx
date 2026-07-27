import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"
import Link from "next/link"

export function AuthRequired() {
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
          <Button className="w-full cursor-pointer">Login to Account</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
