"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Search as SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { SearchFormSchema, type SearchFormValues } from "@/lib/schemas/search"
import { SearchTrainsCategory } from "@/generated"
import { DatePicker } from "./datePicker"
import { StationAutocompleteInput } from "./stationAutocompleteInput"

/**
 * ## SearchForm
 *
 * Train-search form. Two station autocomplete inputs + a date + an
 * optional category `Select`. On submit, builds a query string and
 * navigates the browser to `/?<qs>`. The page (parent of this form)
 * then reads the URL and fires the `useSearchTrains` query.
 *
 * @param initialValues - The initial form values. Pass URL-derived
 *   values so deep-linking / refresh restores the same search.
 * @param className - Optional container class.
 */
export function SearchForm({
  initialValues,
  className,
}: {
  readonly initialValues?: Partial<SearchFormValues>
  readonly className?: string
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(SearchFormSchema),
    defaultValues: {
      fromStation: initialValues?.fromStation ?? "",
      toStation: initialValues?.toStation ?? "",
      date: initialValues?.date ?? today,
      category: initialValues?.category,
    },
  })

  // Local mirror of the typed station names. We render these in the
  // autocomplete inputs and only commit them back to the form on
  // selection (so typing freely doesn't dirty validation).
  const [fromDisplayName, setFromDisplayName] = useState<string>(
    initialValues?.fromStation ?? ""
  )
  const [toDisplayName, setToDisplayName] = useState<string>(
    initialValues?.toStation ?? ""
  )

  const onSubmit = (values: SearchFormValues) => {
    const params = new URLSearchParams()
    if (values.fromStation) params.set("from", values.fromStation)
    if (values.toStation) params.set("to", values.toStation)
    if (values.date) params.set("date", values.date)
    if (values.category) params.set("category", values.category)
    router.replace(`/?${params.toString()}`)
  }

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldSet>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(form.formState.errors.fromStation)}>
              <FieldLabel htmlFor="from-station">From</FieldLabel>
              <Controller
                control={form.control}
                name="fromStation"
                render={({ field }) => (
                  <StationAutocompleteInput
                    id="from-station"
                    value={field.value}
                    displayName={fromDisplayName}
                    onChange={(code, station) => {
                      field.onChange(code)
                      setFromDisplayName(
                        station ? `${station.name} (${station.code})` : ""
                      )
                    }}
                    onInputValueChange={setFromDisplayName}
                    placeholder="Origin station (e.g. NDLS)"
                    invalid={Boolean(form.formState.errors.fromStation)}
                    excludeStationId={undefined}
                  />
                )}
              />
              {form.formState.errors.fromStation && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.fromStation.message}
                </p>
              )}
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.toStation)}>
              <FieldLabel htmlFor="to-station">To</FieldLabel>
              <Controller
                control={form.control}
                name="toStation"
                render={({ field }) => (
                  <StationAutocompleteInput
                    id="to-station"
                    value={field.value}
                    displayName={toDisplayName}
                    onChange={(code, station) => {
                      field.onChange(code)
                      setToDisplayName(
                        station ? `${station.name} (${station.code})` : ""
                      )
                    }}
                    onInputValueChange={setToDisplayName}
                    placeholder="Destination station (e.g. HWH)"
                    invalid={Boolean(form.formState.errors.toStation)}
                  />
                )}
              />
              {form.formState.errors.toStation && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.toStation.message}
                </p>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field data-invalid={Boolean(form.formState.errors.date)}>
              <FieldLabel htmlFor="date">Travel Date</FieldLabel>
              <Controller
                control={form.control}
                name="date"
                render={({ field }) => (
                  <DatePicker
                    id="date"
                    value={field.value}
                    onChange={(iso) => field.onChange(iso)}
                    placeholder="Pick a travel date"
                    invalid={Boolean(form.formState.errors.date)}
                  />
                )}
              />
              {form.formState.errors.date && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.date.message}
                </p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="category">Category</FieldLabel>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "ALL"}
                    onValueChange={(value) => {
                      field.onChange(
                        value === "ALL"
                          ? undefined
                          : (value as SearchTrainsCategory)
                      )
                    }}
                  >
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All categories</SelectItem>
                      {Object.values(SearchTrainsCategory).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field>
              <FieldLabel className="md:opacity-0">Search</FieldLabel>
              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={form.formState.isSubmitting}
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                Search
              </Button>
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
