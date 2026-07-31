export const CONSUMER_GROUPS = {
  NOTIFICATION_OTP: "notification-service-otp-consumer",
  NOTIFICATION_WELCOME: "notification-service-welcome-consumer",
  INVENTORY_SCHEDULE_CREATED: "inventory-service-schedule-created-consumer",
  INVENTORY_SCHEDULE_STATUS_CHANGED:
    "inventory-service-schedule-status-change-consumer",
  SEARCH_STATION_CREATED: "search-service-station-created-consumer",
  SEARCH_STATION_UPDATED: "search-service-station-updated-consumer",
  SEARCH_STATION_DEACTIVATED: "search-service-station-deactivated-consumer",
} as const;
