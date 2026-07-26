import geoip from "geoip-lite";

/**
 * Resolves a human-readable location string (e.g. "Mumbai, India") from an IP address.
 * Handles local development IP addresses (127.0.0.1, ::1) gracefully.
 *
 * @param ip - IP address string
 * @returns Human-readable location string
 */
export function getIpLocation(ip?: string): string {
  if (!ip) return "Unknown Location";

  const cleanIp = ip.replace(/^::ffff:/, "").trim();

  if (
    cleanIp === "127.0.0.1" ||
    cleanIp === "::1" ||
    cleanIp === "localhost" ||
    cleanIp.startsWith("192.168.") ||
    cleanIp.startsWith("10.")
  ) {
    return "Local Development";
  }

  const geo = geoip.lookup(cleanIp);
  if (!geo) return "Unknown Location";

  const city = geo.city ? `${geo.city}, ` : "";
  const country = geo.country || "";
  return `${city}${country}`.trim() || "Unknown Location";
}
