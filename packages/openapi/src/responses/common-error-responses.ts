import "./create-response.js";
import { ErrorResponses } from "./error-responses.js";

/**
 * Baseline error responses included on almost every microservice endpoint.
 *
 * Spreads as `{ 200: ..., ...CommonErrorResponses, 401: ... }` so endpoint
 * handlers keep only the status codes specific to their operation. The set is
 * kept intentionally narrow — adding a status here means every endpoint in
 * every service advertises it.
 */
export const CommonErrorResponses = {
  400: ErrorResponses[400],
  429: ErrorResponses[429],
  500: ErrorResponses[500],
};
