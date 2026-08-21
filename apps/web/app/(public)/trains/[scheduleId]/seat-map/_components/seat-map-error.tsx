import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * ## SeatMapError
 *
 * Error fallback for the seat-map view. Renders a destructive card
 * with the human-readable error message and a Retry button.
 *
 * Distinguishes 404 ("no such schedule") from generic failures so
 * the user gets an actionable message: a 404 means the underlying
 * schedule has been cancelled and there is no seat-map to render.
 */
function getFallbackMessage(status: number | undefined): string {
  if (status === 404) {
    return "This schedule has no seat map to show — it may have been cancelled or removed."
  }
  if (status === 409) {
    return "This schedule is no longer active. Please pick another train."
  }
  return "Couldn't load the seat map. Please try again."
}

export function SeatMapError({
  error,
  onRetry,
  isRefetching,
}: {
  readonly error: unknown
  readonly onRetry: () => void
  readonly isRefetching?: boolean
}) {
  const status = (error as { response?: { status?: number } } | undefined)
    ?.response?.status

  const fallback = getFallbackMessage(status)

  const message = getErrorMessage(error, fallback)

  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">{message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRefetching}
        >
          {isRefetching ? "Retrying…" : "Retry"}
        </Button>
      </CardContent>
    </Card>
  )
}
