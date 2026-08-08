"use client"

import { useId, useMemo } from "react"
import { Loader2, MapPin, Train, X } from "lucide-react"

import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useStationSuggestions } from "@/app/(public)/_hooks"
import type { StationSuggestion } from "@/generated"

/**
 * Renders a single suggestion row: a MapPin icon, the station code,
 * the station name, and an optional zone · state subtitle on the
 * right. Lives outside the component file so React keeps the identity
 * stable across re-renders.
 */
function StationRow({ station }: { readonly station: StationSuggestion }) {
  const subtitle = [station.zone, station.state].filter(Boolean).join(" · ")
  return (
    <>
      <MapPin className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 truncate">
        <span className="font-mono font-semibold">{station.code}</span>
        <span className="ml-2">{station.name}</span>
      </span>
      {subtitle && (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      )}
    </>
  )
}

/**
 * Builds the human-readable label used by the input for a selected
 * station — e.g. "New Delhi (NDLS)".
 */
function formatDisplayName(station: StationSuggestion): string {
  return `${station.name} (${station.code})`
}

/**
 * ## StationAutocompleteInput
 *
 * Combobox-based station picker. Wraps the debounced
 * `useStationSuggestions` query with the shadcn `Combobox` primitive
 * so the popover anchoring, keyboard nav, focus management, and
 * click-outside behaviour come from `@base-ui/react` instead of being
 * hand-rolled.
 *
 * **Strict pick-to-save**: typing freely only updates the input text;
 * the form value is only committed when a suggestion is selected (by
 * click, or by Enter on the auto-highlighted first row). Free text
 * never becomes the form value — which matches the search backend's
 * `STATION_NOT_FOUND` 404 contract.
 *
 * `autoHighlight` is enabled so the first matching row is highlighted
 * as soon as the list opens; Enter commits that row. The clear button
 * (`X`) clears the field when a station is selected.
 *
 * Usage:
 *   ```tsx
 *   <StationAutocompleteInput
 *     value={field.value}
 *     displayName={field.displayName}
 *     onChange={(code, station) => field.onChange(code)}
 *     onInputValueChange={setFromDisplayName}
 *     placeholder="Origin station (e.g. NDLS)"
 *   />
 *   ```
 *
 * @param value - The currently-selected station code (or empty).
 * @param displayName - The text rendered in the input. Either the
 *   picked station's display name, or whatever the user has typed so
 *   far. Parent owns this state.
 * @param onChange - Fires with the new code on selection. `station` is
 *   the full payload or `undefined` when the user cleared the input.
 * @param onInputValueChange - Fires with the current input text on
 *   every keystroke. The parent uses this to keep its `displayName`
 *   mirror in sync so the input reflects what the user typed.
 * @param placeholder - Input placeholder text.
 * @param excludeStationId - Optional `stationId` to hide (so the `To`
 *   field doesn't suggest the same station as the `From` field).
 * @param id - DOM id for the input (used for label `htmlFor`).
 * @param invalid - When true, applies destructive styling.
 */
export function StationAutocompleteInput({
  value,
  displayName,
  onChange,
  onInputValueChange,
  placeholder,
  excludeStationId,
  id,
  invalid,
}: {
  readonly value: string
  readonly displayName: string
  readonly onChange: (code: string, station?: StationSuggestion) => void
  readonly onInputValueChange: (text: string) => void
  readonly placeholder: string
  readonly excludeStationId?: string
  readonly id?: string
  readonly invalid?: boolean
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const anchorRef = useComboboxAnchor()

  // Only fetch suggestions once the user has typed enough to satisfy
  // the backend's 2-char minimum. The query stays idle otherwise.
  const isLongEnough = displayName.trim().length >= 2
  const suggestions = useStationSuggestions(isLongEnough ? displayName : "")
  // Hoist into `useMemo` so the array identity is stable across renders;
  // otherwise the downstream `useMemo`s fire on every render and base-ui
  // would thrash on item equality.
  const rawStations = useMemo(
    () => suggestions.data?.data?.stations ?? [],
    [suggestions.data]
  )
  const stations = useMemo(
    () =>
      excludeStationId
        ? rawStations.filter((s) => s.stationId !== excludeStationId)
        : rawStations,
    [excludeStationId, rawStations]
  )

  // Selected item identity for the popover — base-ui uses Map() equality
  // by default, so we pass the matching station object back when the
  // form value is set (and a query has already returned that station).
  const selectedItem = useMemo(
    () => rawStations.find((s) => s.code === value) ?? null,
    [rawStations, value]
  )

  return (
    <Combobox
      items={stations}
      value={selectedItem}
      onValueChange={(next: StationSuggestion | null) => {
        if (next) {
          onChange(next.code, next)
        } else {
          onChange("", undefined)
        }
      }}
      // How base-ui turns the object value back into the input label
      // when an item is selected.
      itemToStringLabel={formatDisplayName}
      itemToStringValue={(station) => station.code}
      inputValue={displayName}
      onInputValueChange={(next) => {
        // Free-text typing only updates the input mirror in the parent —
        // we never commit a free-text station code to the form.
        onInputValueChange(next)
        if (next !== displayName && value) {
          onChange("", undefined)
        }
      }}
      // Strict pick-to-save: disable cmdk's text-driven filtering (we
      // already filter server-side) and stop the combobox from
      // auto-filling the input with the highlighted item while typing.
      filter={null}
      autoComplete="none"
      // Highlight the first matching row so Enter commits a pick.
      autoHighlight
    >
      {/* Leading icon + custom input + trailing clear, composed by hand
          because the prepackaged `ComboboxInput` from this codebase only
          supports a trailing trigger/clear — not a leading icon. */}
      <InputGroup
        ref={anchorRef}
        className={
          invalid ? "border-destructive ring-3 ring-destructive/20" : undefined
        }
      >
        <InputGroupAddon align="inline-start">
          <Train className="h-4 w-4 text-muted-foreground" />
        </InputGroupAddon>
        <ComboboxPrimitive.Input
          id={inputId}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={invalid ? "true" : undefined}
          render={<InputGroupInput />}
        />
        {value && (
          <InputGroupAddon align="inline-end">
            <ComboboxPrimitive.Clear
              render={
                <InputGroupButton
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear station"
                />
              }
            >
              <X className="h-4 w-4" />
            </ComboboxPrimitive.Clear>
          </InputGroupAddon>
        )}
      </InputGroup>

      <ComboboxContent anchor={anchorRef}>
        {/* Empty sentinel lives OUTSIDE the list so it sits flush under
            the input. Per base-ui docs, the component must remain
            mounted; only its children change based on list state. */}
        <ComboboxEmpty>
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            {isLongEnough
              ? "No stations found."
              : "Type at least 2 characters to search."}
          </div>
        </ComboboxEmpty>
        {suggestions.isFetching && (
          <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Searching stations…
          </div>
        )}
        <ComboboxList>
          {stations.map((station) => (
            <ComboboxItem key={station.stationId} value={station}>
              <StationRow station={station} />
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
