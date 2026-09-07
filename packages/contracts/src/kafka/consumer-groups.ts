export const CONSUMER_GROUPS = {
  NOTIFICATION_OTP: "notification-service-otp-consumer",
  NOTIFICATION_WELCOME: "notification-service-welcome-consumer",
  INVENTORY_SCHEDULE_CREATED: "inventory-service-schedule-created-consumer",
  INVENTORY_SCHEDULE_STATUS_CHANGED:
    "inventory-service-schedule-status-change-consumer",
  SEARCH_STATION_CREATED: "search-service-station-created-consumer",
  SEARCH_STATION_UPDATED: "search-service-station-updated-consumer",
  SEARCH_STATION_DEACTIVATED: "search-service-station-deactivated-consumer",
  SEARCH_SCHEDULE_CREATED: "search-service-schedule-created-consumer",
  SEARCH_SCHEDULE_STATUS_CHANGED:
    "search-service-schedule-status-change-consumer",
  BOOKING_STATUS_BROADCAST: "booking-service-status-broadcast-consumer",
  SEAT_AVAILABILITY_BROADCAST:
    "booking-service-seat-availability-broadcast-consumer",
  BOOKING_SEATS_RESULT: "booking-service-seats-result-consumer",
  INVENTORY_HOLD_SEATS_REQUESTED:
    "inventory-service-hold-seats-requested-consumer",
  BOOKING_AUTO_CONFIRM: "booking-service-auto-confirm-consumer",
  BOOKING_PAYMENT_SUCCESS: "booking-service-payment-success-consumer",
  PAYMENT_BOOKING_CANCELLED: "payment-service-booking-cancelled-consumer",
  INVENTORY_BOOKING_STATUS_CHANGED:
    "inventory-service-booking-status-changed-consumer",
  // cancellation refund saga
  PAYMENT_REFUND_REQUESTED: "payment-service-refund-requested-consumer",
  BOOKING_REFUND_RESULT: "booking-service-refund-result-consumer",
} as const;
