import { Suspense } from "react"

import { SearchPage, SearchPageSkeleton } from "./(public)/_components"

/**
 * ## Root Page
 *
 * Server component that wraps the client-side `SearchPage` in a
 * Suspense boundary. While Next.js streams the page bundle, the
 * `SearchPageSkeleton` is rendered so the user sees a stable layout
 * immediately.
 *
 * The search form lives at the root because the search endpoints are
 * public and there is no auth gate. Once the user submits, results
 * render below the form (driven by URL search params).
 */
export default function Page() {
  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchPage />
    </Suspense>
  )
}
