import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

/**
 * ## TrainResultCardSkeleton
 *
 * Loading placeholder for a single train result card. Matches the
 * layout of `TrainResultCard` so the transition between skeleton and
 * content is smooth (no layout shift).
 */
export function TrainResultCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4">
        {/* Header row: train number + name + status pill */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>

        <Separator />

        {/* Two-column body: departure | arrival */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        {/* Footer row: meta + button */}
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
      </CardContent>
    </Card>
  )
}
