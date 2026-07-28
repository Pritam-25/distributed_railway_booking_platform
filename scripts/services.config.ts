/**
 * Service metadata for repository-infrastructure scripts.
 *
 * This module is shared by `scripts/sync-postman.ts` and any future repo-level
 * tool that needs to know which apps exist and how they should be treated:
 *
 *   - `sync-postman.ts`        — mirror generated OpenAPI specs into Postman
 *   - `validate-openapi.ts`    — (future) lint per-service specs
 *   - `generate-doc-index.ts`  — (future) produce a cross-service API index
 *   - `publish-docs.ts`        — (future) ship specs to a static-docs host
 *
 * The `publish` flag defaults to **false** for any service not listed here.
 * This is the safe default: a service's spec is mirrored to Postman only after
 * an explicit decision has been recorded in this file. Adding a new internal
 * or admin-only service therefore has no risk of accidentally exposing it in
 * the public Postman workspace.
 *
 * Why the gateway is listed here:
 *   The gateway produces `apps/api-gateway/openapi.yaml`, which is the unified
 *   public API contract. It is intentionally published alongside the user
 *   service spec so Postman consumers see both the aggregated gateway contract
 *   and the underlying user-service surface.
 */

export type ServiceMetadata = {
  /**
   * Display name used as the directory under `postman/specs/<displayName>/`
   * and as the human-readable label in summary logs.
   */
  displayName: string;

  /**
   * When `true`, the service's `apps/<id>/openapi.yaml` is mirrored into
   * `postman/specs/<displayName>/openapi.yaml`. When `false`, it is skipped
   * (a log line is still emitted so the omission is visible).
   */
  publish: boolean;
};

/**
 * Map of service id → metadata. The id matches the workspace package name
 * (e.g. `apps/user-service` has id `user-service`).
 *
 * Add new entries here when a service is intended to be visible in Postman.
 * Services absent from this map are scanned (so we don't silently miss them
 * in logs) but treated as `publish: false`.
 */
export const SERVICES: Readonly<Record<string, ServiceMetadata>> = {
  "user-service": {
    displayName: "User Service API",
    publish: true,
  },
  "api-gateway": {
    displayName: "API Gateway",
    publish: true,
  },
  // Future services — add entries here when they are intended for Postman:
  // "booking-service":   { displayName: "Booking Service API",   publish: true  },
  // "payment-service":   { displayName: "Payment Service API",   publish: true  },
  // "inventory-service": { displayName: "Inventory Service API", publish: true  },
  // "search-service":    { displayName: "Search Service API",    publish: true  },
  // "admin-service":     { displayName: "Admin Service API",     publish: true  },
  // "notification-service": { displayName: "Notification Service API", publish: false },
};
