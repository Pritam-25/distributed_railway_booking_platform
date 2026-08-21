import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * ## SeatMapSkeleton
 *
 * Loading placeholder for the seat-map view. Mirrors the layout of
 * `SeatMapPage`: a header row, a sub-header for station/date, and
 * two coach-card skeletons each with a 5x4 grid of seat placeholders.
 */
export function SeatMapSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header row */}
      <header className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
      </header>

      {/* Two coach skeletons */}
      {[0, 1].map((index) => (
        <CoachSkeleton key={index} />
      ))}
    </div>
  )
}

/**
 * ## CoachSkeleton
 *
 * Single coach placeholder. Matches `SeatMapGrid`: a header row +
 * a grid of seat placeholders.
 */
function CoachSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </CardHeader>
      <Separator />
      <CardContent>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, row) => (
            <div
              key={row}
              className="grid grid-cols-[repeat(3,minmax(0,1fr))_18px_repeat(2,minmax(0,1fr))] items-center gap-1.5"
            >
              {Array.from({ length: 5 }).map((_, col) => (
                <Skeleton key={col} className="h-9 w-full" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
