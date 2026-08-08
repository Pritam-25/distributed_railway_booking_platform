import { Skeleton } from "@/components/ui/skeleton"

import { SearchFormSkeleton } from "./searchFormSkeleton"
import { TrainResultCardSkeleton } from "./trainResultCardSkeleton"

/**
 * ## SearchPageSkeleton
 *
 * Top-level Suspense fallback for the search page. Mirrors the
 * `SearchPage` layout: a header row, the search-form skeleton, and
 * three result-card skeletons.
 */
export function SearchPageSkeleton() {
  return (
    <div className="min-h-svh bg-muted/30 px-4 py-8 md:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {/* Heading row */}
        <header className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
        </header>

        {/* Form */}
        <SearchFormSkeleton />

        {/* Three result-card skeletons */}
        <div className="flex flex-col gap-4">
          <TrainResultCardSkeleton />
          <TrainResultCardSkeleton />
          <TrainResultCardSkeleton />
        </div>
      </div>
    </div>
  )
}
