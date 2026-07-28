import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function LoginFormSkeleton() {
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="flex w-full flex-col gap-6 p-6 md:p-8">
          {/* Header */}
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-52" />
          </div>
          {/* OAuth button */}
          <Skeleton className="h-9 w-full rounded-md" />
          {/* Separator */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-px flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-px flex-1" />
          </div>
          {/* Email field */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          {/* Password field */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          {/* Submit button */}
          <Skeleton className="h-9 w-full rounded-md" />
          {/* Footer */}
          <div className="flex justify-center gap-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
