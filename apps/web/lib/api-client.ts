import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios"

/**
 * Production-Grade Axios Instance configured for API Gateway
 */
export const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  withCredentials: true, // Send/receive HTTP-only cookies
  headers: {
    "Content-Type": "application/json",
  },
})

/**
 * Request Interceptor
 */
AXIOS_INSTANCE.interceptors.request.use(
  (config) => config,
  (error) => {
    throw error
  }
)

/**
 * Response Interceptor
 */
AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  (error) => {
    throw error
  }
)

/**
 * Polymorphic Custom Mutator for Orval.
 * Supports both customInstance(url, config) and customInstance({ url, method, data }) signatures.
 */
export const customInstance = <T>(
  urlOrConfig: string | AxiosRequestConfig,
  config?: AxiosRequestConfig | RequestInit
): Promise<T> => {
  const requestConfig: AxiosRequestConfig =
    typeof urlOrConfig === "string"
      ? { url: urlOrConfig, ...(config as AxiosRequestConfig) }
      : { ...urlOrConfig, ...(config as AxiosRequestConfig) }

  const source = axios.CancelToken.source()
  const promise = AXIOS_INSTANCE({
    ...requestConfig,
    cancelToken: source.token,
  }).then((res: AxiosResponse<T>) => res.data)

  // @ts-expect-error - Attach cancel method for TanStack Query cancellation signals
  promise.cancel = () => {
    source.cancel("Query cancelled")
  }

  return promise
}

export default customInstance
