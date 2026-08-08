import geoip from "geoip-lite";

/**
 * Resolves a human-readable location string (e.g. `"Mumbai, IN"`) for an
 * IP address.
 *
 * @remarks
 * Treats loopback (`127.0.0.1`, `::1`), `localhost`, and common private
 * network ranges (`192.168.0.0/16`, `10.0.0.0/8`) as `"Local Development"`.
 * Returns `"Unknown Location"` when GeoIP cannot resolve the address.
 * Strips the IPv4-in-IPv6 prefix (`::ffff:`) before lookup.
 * @param ip - IP address string.
 * @returns Human-readable location string.
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
