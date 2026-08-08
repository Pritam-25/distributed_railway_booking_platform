"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Train } from "lucide-react"

import { SearchTrainsCategory } from "@/generated"
import type { SearchTrainsParams } from "@/generated/model/searchTrainsParams"
import { SearchFormSchema } from "@/lib/schemas/search"

import { SearchForm } from "./searchForm"
import { TrainResultsList } from "./trainResultsList"

/**
 * ## SearchPage
 *
 * Top-level client component for the `/` route. Reads URL search
 * params, hydrates the form with their values, and renders the search
 * results when the params are valid.
 *
 * Reads:
 * - `?from=<code-or-uuid>` — origin station
 * - `?to=<code-or-uuid>`   — destination station
 * - `?date=<YYYY-MM-DD>`   — travel date
 * - `?category=<enum>`     — optional train category
 */
export function SearchPage() {
  const searchParams = useSearchParams()
  const today = new Date().toISOString().slice(0, 10)

  const fromStation = searchParams.get("from") ?? ""
  const toStation = searchParams.get("to") ?? ""
  const date = searchParams.get("date") ?? ""
  const categoryParam = searchParams.get("category") ?? ""

  const initialValues = {
    fromStation,
    toStation,
    date: date || today,
    category: (Object.values(SearchTrainsCategory) as string[]).includes(
      categoryParam
    )
      ? (categoryParam as SearchTrainsCategory)
      : undefined,
  }

  // Validate via the same schema the form uses. Only fire the search
  // when all three required fields are present and pass validation.
  const parsed = useMemo(() => {
    return SearchFormSchema.safeParse({
      fromStation,
      toStation,
      date,
      category: initialValues.category,
    })
  }, [fromStation, toStation, date, initialValues.category])

  const queryParams: SearchTrainsParams | null = parsed.success
    ? {
        fromStation: parsed.data.fromStation,
        toStation: parsed.data.toStation,
        date: parsed.data.date,
        category: parsed.data.category,
      }
    : null

  return (
    <div className="min-h-svh bg-muted/30 px-4 py-8 md:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {/* Page heading */}
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
            <Train className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Search Trains</h1>
            <p className="text-sm text-muted-foreground">
              Find trains running between two stations on your travel date.
            </p>
          </div>
        </header>

        {/* Search form (hydrates from URL on mount) */}
        <SearchForm initialValues={initialValues} />

        {/* Results (only when URL is valid) */}
        {queryParams && <TrainResultsList params={queryParams} />}
      </div>
    </div>
  )
}
