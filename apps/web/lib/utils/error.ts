import type { AxiosError } from "axios"
import type { ErrorResponse } from "@/generated"

/**
 * Extracts human-readable error messages from Axios / Orval error responses using generated ErrorResponse model
 */
export function getErrorMessage(
  error: unknown,
  fallback: string = "An error occurred"
): string {
  if (!error) return fallback
  const axiosError = error as AxiosError<ErrorResponse>
  return (
    axiosError.response?.data?.error?.message || axiosError.message || fallback
  )
}

/**
 * Checks whether an error represents an HTTP 401 Unauthorized response.
 *
 * Useful for distinguishing authentication failures from transient
 * network / 5xx errors so the UI can render the right fallback.
 */
export function isUnauthorizedError(error: unknown): boolean {
  const axiosError = error as AxiosError<ErrorResponse> | undefined
  return axiosError?.response?.status === 401
}
