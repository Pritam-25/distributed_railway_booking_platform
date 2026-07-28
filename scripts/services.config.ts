/**
 * Service metadata for repository-infrastructure scripts.
 *
 * This module is shared by `scripts/sync-postman.ts`, `scripts/filter-sdk-spec.ts`,
 * and any future repo-level tool that needs to know which apps exist and how
 * they should be treated:
 *
 *   - `sync-postman.ts`        — mirror generated OpenAPI specs into Postman
 *   - `filter-sdk-spec.ts`     — strip SDK-excluded tags from the gateway spec
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

  /**
   * When `true`, the service's `apps/<id>/openapi.yaml` is included as an
   * input to the gateway's `redocly join` step. The api-gateway itself is
   * the merged output and must opt out — set this to `false` to exclude a
   * service from the merged gateway contract while still publishing it to
   * Postman (or vice versa).
   *
   * Defaults to `true` when omitted, so leaf services do not need to set
   * this explicitly.
   */
  mergeInput?: boolean;

  /**
   * When `true`, the service's operations are included in
   * `apps/api-gateway/openapi.sdk.json` so orval emits a frontend SDK.
   * When `false`, the service's tags still appear in Postman / Scalar /
   * the merged gateway, but no client code is generated.
   *
   * Defaults to `true` when omitted. Set this to `false` for services whose
   * endpoints should be visible in the public API contract but are not yet
   * consumed by the frontend (e.g. admin-service during early rollout).
   */
  generateSdk?: boolean;

  /**
   * OpenAPI tags emitted by this service's registry. Used by the SDK filter
   * (`scripts/filter-sdk-spec.ts`) to drop paths whose tags belong to a
   * service with `generateSdk: false`. Order is irrelevant.
   */
  tags: string[];
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
    tags: ["Authentication", "Users"],
  },
  "admin-service": {
    displayName: "Admin Service API",
    publish: true,
    // Admin endpoints are part of the public gateway contract and Postman
    // mirror, but no frontend client is generated yet. Flip to `true` (or
    // omit — the default is `true`) when the admin UI is ready to consume
    // them.
    generateSdk: false,
    tags: ["Admin"],
  },
  "api-gateway": {
    displayName: "Railway Booking Platform API",
    publish: true,
    mergeInput: false,
    tags: [],
  },
  // Future services — add entries here when they are intended for Postman:
  // "inventory-service":   { displayName: "Inventory Service API",  publish: true,  tags: ["Inventory"] },
  // "booking-service":     { displayName: "Booking Service API",    publish: true,  tags: ["Bookings"] },
  // "payment-service":     { displayName: "Payment Service API",    publish: true,  tags: ["Payments"] },
  // "search-service":      { displayName: "Search Service API",     publish: true,  tags: ["Stations", "Trains"] },
  // "notification-service":{ displayName: "Notification Service API", publish: false, tags: ["Notifications"] },
};
