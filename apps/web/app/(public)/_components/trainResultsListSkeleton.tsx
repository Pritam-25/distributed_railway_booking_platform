import { TrainResultCardSkeleton } from "./trainResultCardSkeleton"

/**
 * ## TrainResultsListSkeleton
 *
 * Loading placeholder for the train results list. Renders 5 stacked
 * card skeletons to match the typical first page of search results.
 */
export function TrainResultsListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <TrainResultCardSkeleton key={index} />
      ))}
    </div>
  )
}
