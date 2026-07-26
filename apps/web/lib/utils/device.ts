import { UAParser } from "ua-parser-js"
import {
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  Terminal,
  type LucideIcon,
} from "lucide-react"

/**
 * Resolves an appropriate Lucide icon component based on the request User-Agent.
 *
 * @param userAgent User-Agent header string
 * @returns Corresponding Lucide icon component
 */
export function getDeviceIcon(userAgent?: string): LucideIcon {
  if (!userAgent) return Monitor
  const uaLower = userAgent.toLowerCase()
  if (uaLower.includes("postmanruntime")) {
    return Terminal
  }

  const parser = new UAParser(userAgent)
  const deviceType = parser.getDevice().type

  if (deviceType === "mobile") return Smartphone
  if (deviceType === "tablet") return Tablet
  return Laptop
}

/**
 * Formats a user-friendly browser and OS label from a User-Agent string.
 *
 * @param userAgent User-Agent header string
 * @returns Formatted device string (e.g. "Chrome on Windows")
 */
export function getDeviceName(userAgent?: string): string {
  if (!userAgent) return "Unknown Device"
  const uaLower = userAgent.toLowerCase()
  if (uaLower.includes("postmanruntime")) {
    return "Postman API Client"
  }

  const parser = new UAParser(userAgent)
  const browser = parser.getBrowser().name || "Unknown Browser"
  const os = parser.getOS().name || "Unknown OS"

  if (browser === "Unknown Browser" && os === "Unknown OS") {
    return "Unknown Device"
  }

  return `${browser} on ${os}`
}
