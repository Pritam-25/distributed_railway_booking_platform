export const KAFKA_TOPICS = {
  // ------------ user domain ------------
  USER_OTP_REQUESTED: "user.otp-requested.v1",
  USER_LOGGED_IN: "user.logged-in.v1",

  // ------------ admin domain ------------

  // train related events
  TRAIN_CREATED: "admin.train-created.v1",
  TRAIN_UPDATED: "admin.train-updated.v1",
  TRAIN_DEACTIVATED: "admin.train-deactivated.v1",

  // coach related events
  COACH_CREATED: "admin.coach-created.v1",
  COACH_UPDATED: "admin.coach-updated.v1",
  COACH_DELETED: "admin.coach-deleted.v1",

  // seat template related events
  SEAT_TEMPLATE_CREATED: "admin.seat-template-created.v1",

  // station related events
  STATION_CREATED: "admin.station-created.v1",
  STATION_UPDATED: "admin.station-updated.v1",
  STATION_DEACTIVATED: "admin.station-deactivated.v1",

  // route related events
  ROUTE_CREATED: "admin.route-created.v1",
  ROUTE_UPDATED: "admin.route-updated.v1",
  ROUTE_DELETED: "admin.route-deleted.v1",
  ROUTE_STATION_ADDED: "admin.route-station-added.v1",
  ROUTE_STATION_UPDATED: "admin.route-station-updated.v1",
  ROUTE_STATION_REMOVED: "admin.route-station-removed.v1",

  // schedule related events
  SCHEDULE_CREATED: "admin.schedule-created.v1",
  SCHEDULE_STATUS_CHANGED: "admin.schedule-status-changed.v1",

  // ------------ inventory domain ------------
  INVENTORY_SCHEDULE_PROJECTED: "inventory.schedule-projected.v1",
  INVENTORY_SCHEDULE_STATUS_CHANGED: "inventory.schedule-status-changed.v1",

  // ------------ booking ↔ inventory saga ------------
  BOOKING_HOLD_SEATS_REQUESTED: "booking.hold-seats-requested.v1",
  INVENTORY_SEATS_HELD: "inventory.seats-held.v1",
  INVENTORY_SEATS_HOLD_FAILED: "inventory.seats-hold-failed.v1",
  INVENTORY_SEAT_HOLD_EXPIRED: "inventory.seat-hold-expired.v1",

  // ------------ booking domain ------------
  BOOKING_STATUS_CHANGED: "booking.status-changed.v1",
} as const;

/**
 * Dead-letter topic names, derived from the canonical topic constants. The
 * DLQ wrapper in `@irctc/kafka` (`wrapWithDlq`) writes to `<TOPIC>_DLQ`.
 */
export const KAFKA_DLQ_TOPICS = {
  BOOKING_HOLD_SEATS_REQUESTED_DLQ: `${KAFKA_TOPICS.BOOKING_HOLD_SEATS_REQUESTED}.dlq`,
  INVENTORY_SEATS_HELD_DLQ: `${KAFKA_TOPICS.INVENTORY_SEATS_HELD}.dlq`,
  INVENTORY_SEATS_HOLD_FAILED_DLQ: `${KAFKA_TOPICS.INVENTORY_SEATS_HOLD_FAILED}.dlq`,
  INVENTORY_SEAT_HOLD_EXPIRED_DLQ: `${KAFKA_TOPICS.INVENTORY_SEAT_HOLD_EXPIRED}.dlq`,
} as const;
