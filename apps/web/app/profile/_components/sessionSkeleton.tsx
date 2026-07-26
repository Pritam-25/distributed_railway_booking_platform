import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function SessionSkeleton() {
  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-8 w-8 rounded-md" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-4 border-t border-border/40 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-6 w-6 rounded-lg" />
          <Skeleton className="h-3 w-60" />
        </div>
        <Skeleton className="h-9 w-full rounded-md sm:w-44" />
      </CardFooter>
    </Card>
  )
}
