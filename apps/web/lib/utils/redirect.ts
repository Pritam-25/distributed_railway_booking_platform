/**
 * Sanitizes a redirect URL to prevent Open Redirect vulnerabilities.
 *
 * Allows only relative internal application paths (e.g., `/profile`, `/bookings`)
 * and rejects external, protocol-relative, or malformed URLs by returning the fallback.
 */
export function getSafeRedirectTarget(
  target: string | null | undefined,
  fallback = "/profile"
): string {
  if (!target) return fallback

  // Reject paths that do not start with '/' or start with '//' or '/\'
  if (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.startsWith("/\\")
  ) {
    return fallback
  }

  try {
    const url = new URL(target, "http://localhost")
    if (url.origin !== "http://localhost") {
      return fallback
    }
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
