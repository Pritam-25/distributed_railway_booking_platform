/**
 * ## seatMapKeys
 *
 * Centralised React Query key factory for the seat-map feature. Use these
 * for invalidation and dedupe; the typed helpers guarantee that hook
 * call-sites share the same key shape as other consumers.
 */
export const seatMapKeys = {
  all: ["seat-map"] as const,

  /**
   * Query key for a `(scheduleId, fromStationId, toStationId)` triplet.
   * Serialised via `JSON.stringify` so different object identity
   * combinations of the same logical params collapse to one entry
   * (the orval SDK reuses literal objects across renders).
   */
  seatMap: (params: {
    readonly scheduleId: string
    readonly fromStation: string
    readonly toStation: string
  }) =>
    [
      ...seatMapKeys.all,
      params.scheduleId,
      params.fromStation,
      params.toStation,
    ] as const,
}
