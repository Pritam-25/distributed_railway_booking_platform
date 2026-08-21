import { Suspense } from "react"

import { SeatMapPage, SeatMapSkeleton } from "./_components"

/**
 * ## Seat Map Page
 *
 * Server component that wraps the client-side `SeatMapPage` in a
 * Suspense boundary. The fallback (`SeatMapSkeleton`) renders while
 * Next.js streams the page bundle so the user sees a stable layout
 * immediately.
 *
 * The seat-map is a public route — no auth gate. The page lives under
 * `(public)/trains/[scheduleId]/seat-map` so the dynamic route segment
 * is exposed in the URL for deep-linking.
 */
export default function Page({
  params,
}: {
  readonly params: Promise<{ readonly scheduleId: string }>
}) {
  return (
    <div className="min-h-svh bg-muted/30 px-4 py-8 md:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <Suspense fallback={<SeatMapSkeleton />}>
          <SeatMapPage params={params} />
        </Suspense>
      </div>
    </div>
  )
}
