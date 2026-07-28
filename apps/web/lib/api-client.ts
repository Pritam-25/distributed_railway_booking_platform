import axios, {
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios"

/**
 * Custom request configuration extending the standard Axios Request Config.
 * Includes a `_retry` tracking flag to prevent infinite loops when retrying
 * unauthorized requests after an access token refresh.
 */
interface RetryAxiosRequestConfig extends InternalAxiosRequestConfig {
  /** Flag to track whether the request has already been retried once */
  _retry?: boolean
}

/**
 * Shared promise for the active refresh token request.
 * Using a shared promise ensures that multiple concurrent API requests that fail
 * with a 401 simultaneously only trigger a single POST request to the refresh token endpoint.
 * This prevents violating the backend's Refresh Token Rotation (RTR) reuse-detection mechanism.
 */
let refreshPromise: Promise<AxiosResponse<unknown>> | null = null

/**
 * Flag to track if the user has initiated the logout flow.
 * If true, any background requests failing due to access token expiration
 * will not trigger a token refresh or attempt to re-authenticate the user.
 */
let isLoggingOut = false

/**
 * Flag to track if a redirect to the login page is currently active.
 * Prevents multiple concurrent failed requests from launching multiple login page redirects.
 */
let isRedirecting = false

/**
 * Production-Grade Axios Instance configured for the API Gateway.
 * Configured with `withCredentials: true` to automatically forward HTTP-only cookies
 * (e.g. `access_token` and `refresh_token`) to and from the backend.
 */
export const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  timeout: 15000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

/**
 * Request Interceptor
 * Monitors outgoing requests to detect session-changing actions:
 * 1. Hitting the logout endpoint marks `isLoggingOut = true` to stop silent refreshes.
 * 2. Hitting login or OTP verification endpoints resets `isLoggingOut = false` and `isRedirecting = false`.
 */
AXIOS_INSTANCE.interceptors.request.use(
  (config) => {
    if (config.url?.includes("/api/v1/auth/logout")) {
      isLoggingOut = true
    } else if (
      config.url?.includes("/api/v1/auth/login") ||
      config.url?.includes("/api/v1/auth/verify-otp")
    ) {
      isLoggingOut = false
      isRedirecting = false
    }
    return config
  },
  (error) => {
    throw error
  }
)

/**
 * Helper function to trigger a browser-side redirect to the login page.
 * Uses a concurrency guard `isRedirecting` to avoid redundant redirects.
 */
const handleRedirectToLogin = (): void => {
  if (typeof window !== "undefined" && !isRedirecting) {
    isRedirecting = true
    const currentPath = window.location.pathname
    const redirectParam =
      currentPath && currentPath !== "/"
        ? `?redirect=${encodeURIComponent(currentPath)}`
        : ""
    window.location.href = `/login${redirectParam}`
  }
}

/**
 * Helper function to orchestrate the silent refresh of tokens and retry the original request.
 * Resolves race conditions by checking if the user logged out while refresh was in-flight.
 *
 * @param {RetryAxiosRequestConfig} originalRequest - The configuration of the request that failed.
 * @returns {Promise<AxiosResponse<unknown>>} Resolves with the retried request's response.
 */
const handleTokenRefresh = async (
  originalRequest: RetryAxiosRequestConfig
): Promise<AxiosResponse<unknown>> => {
  originalRequest._retry = true

  // Initialize the refresh request only if there isn't one already running.
  refreshPromise ??= AXIOS_INSTANCE.post<unknown>(
    "/api/v1/auth/refresh"
  ).finally(() => {
    refreshPromise = null
  })

  try {
    // Await the active refresh request (concurrency queueing)
    await refreshPromise

    // Logout race condition check: if logout started while refresh was in-flight, abort retry
    if (isLoggingOut) {
      throw new Error("Refresh aborted due to logout")
    }

    // Retry the original request (the browser will send the newly rotated access_token cookie automatically)
    return await AXIOS_INSTANCE(originalRequest)
  } catch (refreshError) {
    handleRedirectToLogin()
    throw refreshError
  }
}

declare module "axios" {
  export interface AxiosRequestConfig {
    skipAuthRefresh?: boolean
  }
}

/**
 * Response Interceptor
 * Intercepts incoming responses and errors to orchestrate the silent refresh mechanism.
 * Uses single-responsibility helper functions to keep Cognitive Complexity low.
 */
AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryAxiosRequestConfig

    if (!originalRequest) {
      throw error
    }

    const errorCode = error.response?.data?.error?.code
    const isRefreshRequest = originalRequest.url?.includes(
      "/api/v1/auth/refresh"
    )
    const status = error.response?.status

    // Silent refresh triggers when status is 401 AND backend explicitly returns AUTH_REQUIRED
    // AND request did not opt out via skipAuthRefresh
    const shouldRefresh =
      status === 401 &&
      errorCode === "AUTH_REQUIRED" &&
      !originalRequest.skipAuthRefresh &&
      !originalRequest._retry &&
      !isRefreshRequest &&
      !isLoggingOut

    if (shouldRefresh) {
      return handleTokenRefresh(originalRequest)
    }

    const isFailedRefresh =
      isRefreshRequest && (status === 401 || status === 403)
    if (isFailedRefresh) {
      handleRedirectToLogin()
    }

    throw error
  }
)

/**
 * Polymorphic Custom Mutator for Orval.
 * Supports both customInstance(url, config) and customInstance({ url, method, data }) signatures.
 * Integrates AbortController signal logic to handle React Query query cancellation signals.
 *
 * @template T The expected type of the response data.
 * @param {string | AxiosRequestConfig} urlOrConfig - Endpoint URL path or full Axios request configuration object.
 * @param {AxiosRequestConfig | RequestInit} [config] - Optional supplementary configuration options.
 * @returns {Promise<T>} Promise resolving to the response body data.
 */
export const customInstance = <T>(
  urlOrConfig: string | AxiosRequestConfig,
  config?: AxiosRequestConfig | RequestInit
): Promise<T> => {
  const requestConfig: AxiosRequestConfig =
    typeof urlOrConfig === "string"
      ? { url: urlOrConfig, ...(config as AxiosRequestConfig) }
      : { ...urlOrConfig, ...(config as AxiosRequestConfig) }

  const controller = new AbortController()
  const promise = AXIOS_INSTANCE({
    ...requestConfig,
    signal: controller.signal,
  }).then((res: AxiosResponse<T>) => res.data)

  // Attach cancel method mapping to AbortController for TanStack Query cancellation signals
  // @ts-expect-error - Attach cancel method for TanStack Query cancellation signals
  promise.cancel = () => {
    controller.abort()
  }

  return promise
}

export default customInstance
