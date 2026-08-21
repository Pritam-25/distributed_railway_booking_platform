import pretty, { colorizerFactory } from "pino-pretty";
import type { HttpLog } from "./types.js";

const levelColorize = colorizerFactory(true);

// ANSI Escape Codes for CLI coloring
const RESET = "\x1b[0m";
const SERVICE_COLOR = "\x1b[38;5;208m"; // Orange
const MODULE_COLOR = "\x1b[90m"; // Gray
const MESSAGE_COLOR = "\x1b[34m"; // Blue
const UNDERLINE = "\x1b[4m"; // Underline ANSI escape code
const NO_UNDERLINE = "\x1b[24m"; // Disable underline ANSI escape code

/**
 * Regular expression matching HTTP/HTTPS/WS/WSS URLs and localhost endpoint addresses.
 */
const URL_REGEX =
  /(https?:\/\/[^\s"'`)\]}]+|wss?:\/\/[^\s"'`)\]}]+|localhost:\d+[^\s"'`)\]}]*)/g;

/**
 * Wraps any URLs found in text with ANSI underline formatting codes.
 */
const formatUrls = (text: string): string => {
  return text.replace(URL_REGEX, (url) => `${UNDERLINE}${url}${NO_UNDERLINE}`);
};

/**
 * Returns the terminal ANSI color codes based on HTTP status code.
 * - 5xx: Red Background, White Foreground (Server Errors)
 * - 4xx: Yellow Background, Black Foreground (Client Errors)
 * - 3xx: Cyan Background, White Foreground (Redirects)
 * - 2xx/default: Green Background, Black Foreground (Success)
 */
const statusColor = (status: number) => {
  if (status >= 500) return "\x1b[41m\x1b[37m"; // Red BG, White FG
  if (status >= 400) return "\x1b[43m\x1b[30m"; // Yellow BG, Black FG
  if (status >= 300) return "\x1b[46m\x1b[37m"; // Cyan BG, White FG
  return "\x1b[42m\x1b[30m"; // Green BG, Black FG
};

/**
 * Returns terminal ANSI color codes tailored to specific HTTP methods.
 * Colors have been selected for optimal readability on dark terminals.
 */
const methodColor = (method: string) => {
  switch (method?.toUpperCase()) {
    case "GET":
      return "\x1b[48;5;18m\x1b[37m"; // Dark Navy Blue
    case "POST":
      return "\x1b[44m\x1b[37m"; // Blue BG, White FG
    case "PUT":
      return "\x1b[48;5;214m\x1b[30m"; // Orange
    case "PATCH":
      return "\x1b[42m\x1b[30m"; // Green BG, Black FG
    case "DELETE":
      return "\x1b[41m\x1b[37m"; // Red BG, White FG
    default:
      return RESET;
  }
};

const durationColor = "\x1b[47m\x1b[30m"; // White BG, Black FG

// Fixed-width formatting constraints for column-aligned logs
const METHOD_WIDTH = 7;
const STATUS_WIDTH = 3;
const DURATION_WIDTH = 8;
const REMOTE_ADDR_WIDTH = 16;

/**
 * Custom pino-pretty transport formatter.
 * Formats log entries with custom coloring, alignment, and custom layouts:
 * - Non-HTTP modules format: [Service] [Module] message
 * - HTTP module format: [Service] [http] | STATUS | DURATION | REMOTE_ADDR | METHOD "path"
 */
const transport = (opts: Record<string, unknown>) =>
  pretty({
    ...opts,
    colorize: true,
    translateTime: "SYS:yyyy-mm-dd - HH:MM:ss",
    customPrettifiers: {
      level: (logLevel: unknown) => {
        const getLevelLabel = (level: unknown): string => {
          if (typeof level === "string") return level.toUpperCase();
          if (typeof level === "number") {
            if (level >= 60) return "FATAL";
            if (level >= 50) return "ERROR";
            if (level >= 40) return "WARN";
            if (level >= 30) return "INFO";
            if (level >= 20) return "DEBUG";
            return "TRACE";
          }
          return String(level).toUpperCase();
        };

        const label = getLevelLabel(logLevel);
        const colorized = levelColorize(
          logLevel as string | number | undefined,
        );
        const paddedLabel = label.padEnd(5, " ");
        return colorized.replace(label, paddedLabel);
      },
    },
    messageFormat: (log) => {
      const moduleName = typeof log.module === "string" ? log.module : "app";

      // Non-HTTP requests format as a standard single line message
      if (log.module !== "http") {
        const msgVal = log.message ?? log.msg;
        const rawMessage =
          typeof msgVal === "string" ? msgVal : JSON.stringify(msgVal ?? "");
        const formattedMessage = formatUrls(rawMessage);
        return `${SERVICE_COLOR}[${log.service}]${RESET} ${MODULE_COLOR}[${moduleName}]${RESET} ${MESSAGE_COLOR}${formattedMessage}${RESET}`;
      }

      const httpLog = log as HttpLog;
      const code = httpLog.statusCode ?? 200;
      const method = httpLog.method ?? "GET";
      const duration = `${httpLog.durationMs ?? 0}ms`;
      const remoteAddress = httpLog.remoteAddress ?? "unknown";
      const path = httpLog.path ?? "/";

      // Padding for fixed width blocks
      const paddedMethod = ` ${method.toUpperCase().padEnd(METHOD_WIDTH, " ")} `;
      const paddedStatus = ` ${code.toString().padStart(STATUS_WIDTH, " ")} `;
      const paddedDuration = ` ${duration.padStart(DURATION_WIDTH, " ")} `;
      const paddedRemoteAddress = ` ${remoteAddress.padStart(REMOTE_ADDR_WIDTH, " ")} `;

      return (
        `${SERVICE_COLOR}[${httpLog.service ?? "unknown-service"}]${RESET} ${MODULE_COLOR}[http]${RESET} | ` +
        `${statusColor(code)}${paddedStatus}${RESET} | ` +
        `${durationColor}${paddedDuration}${RESET} | ` +
        `${paddedRemoteAddress} | ` +
        `${methodColor(method)}${paddedMethod}${RESET} "${UNDERLINE}${path}${NO_UNDERLINE}"`
      );
    },
  });

export default transport;
