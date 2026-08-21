"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * `YYYY-MM-DD` ↔ local `Date` adapter. We pin the calendar's selected
 * day to the same wall-clock value the URL encodes so DST / timezone
 * shifts do not silently move the selection by a day on round-trips.
 */
const isoToDate = (iso: string): Date | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

const dateToIso = (date: Date | undefined): string => {
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * ## DatePicker
 *
 * Popover + Calendar composition that mirrors the shadcn `date-picker`
 * demo, adapted for form integration. Owns the conversion between the
 * calendar's `Date` payload and the URL/form's `YYYY-MM-DD` string.
 *
 * Usage:
 *   ```tsx
 *   <DatePicker
 *     value={field.value}
 *     onChange={(iso) => field.onChange(iso)}
 *     placeholder="Travel date"
 *     invalid={Boolean(errors.date)}
 *     id="date"
 *   />
 *   ```
 *
 * @param value - Current value as `YYYY-MM-DD` string (or empty).
 * @param onChange - Fires with the new `YYYY-MM-DD` (or empty string to
 *   clear).
 * @param placeholder - Trigger button placeholder text shown when no
 *   date is selected.
 * @param invalid - When true, applies destructive styling to the trigger.
 * @param id - Optional DOM id for the trigger (used for label `htmlFor`).
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  invalid,
  id,
}: {
  readonly value: string
  readonly onChange: (iso: string) => void
  readonly placeholder: string
  readonly invalid?: boolean
  readonly id?: string
}) {
  const selected = useMemo(() => isoToDate(value), [value])

  const handleSelect = (next: Date | undefined) => {
    onChange(dateToIso(next))
  }

  const label = selected ? format(selected, "PPP") : placeholder
  const empty = !selected

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            data-empty={empty}
            aria-invalid={invalid ? "true" : undefined}
            className={cn(
              "w-full justify-start text-left font-normal",
              "data-[empty=true]:text-muted-foreground",
              invalid && "border-destructive"
            )}
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        <span className={cn(empty && "text-muted-foreground")}>{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
