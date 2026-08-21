import { Armchair } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

/**
 * ## SeatMapEmpty
 *
 * Empty state for a successful seat-map response that has no
 * coaches to render. Schedules with no seat inventory (e.g. a
 * non-passenger service, or an admin misconfiguration) hit this
 * branch.
 */
export function SeatMapEmpty() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
        <Armchair className="h-8 w-8" />
        <p className="text-sm font-medium">
          No seat layout is published for this schedule yet.
        </p>
        <p className="text-xs">
          Check back closer to the departure date, or pick a different train.
        </p>
      </CardContent>
    </Card>
  )
}
