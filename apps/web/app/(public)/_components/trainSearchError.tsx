"use client"

import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * ## TrainSearchError
 *
 * Error fallback for `TrainResultsList`. Renders a card with a
 * destructive icon, the human-readable error message, and a Retry
 * button that calls `onRetry`.
 */
export function TrainSearchError({
  error,
  onRetry,
  isRefetching,
}: {
  readonly error: unknown
  readonly onRetry: () => void
  readonly isRefetching?: boolean
}) {
  const message = getErrorMessage(
    error,
    "Couldn't load trains. Please try again."
  )

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
