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
} as const;
