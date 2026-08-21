"use client"

import { useEffect, useState } from "react"

/**
 * ## useDebouncedValue
 *
 * Returns a value that lags behind the input by `delay` ms. Useful for
 * debouncing expensive effects (network calls, fuzzy searches, etc.)
 * that would otherwise fire on every keystroke.
 *
 * The initial render returns `value` unchanged, so SSR and the first
 * client paint agree. After mount, updates are deferred: when `value`
 * stops changing for `delay` ms, the debounced value updates to match.
 *
 * The timer is cleared on unmount to avoid late state updates after
 * the consumer has detached.
 *
 * @example
 * ```ts
 * const [input, setInput] = useState("")
 * const debouncedInput = useDebouncedValue(input, 300)
 *
 * useEffect(() => {
 *   if (debouncedInput.length >= 2) fetchSuggestions(debouncedInput)
 * }, [debouncedInput])
 * ```
 * @param value - The live input value (e.g. from a controlled `<input>`).
 * @param delay - Debounce delay in milliseconds. Defaults to 300ms.
 * @returns The debounced copy of `value`.
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
