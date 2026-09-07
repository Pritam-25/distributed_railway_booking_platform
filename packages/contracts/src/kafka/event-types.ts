export const EVENT_TYPES = {
  // train domain
  TRAIN_CREATED: "TrainCreatedV1",
  TRAIN_UPDATED: "TrainUpdatedV1",
  TRAIN_DEACTIVATED: "TrainDeactivatedV1",

  // coach domain
  COACH_CREATED: "CoachCreatedV1",
  COACH_UPDATED: "CoachUpdatedV1",
  COACH_DEACTIVATED: "CoachDeactivatedV1",

  // seat domain
  SEAT_TEMPLATE_CREATED: "SeatTemplateCreatedV1",

  // station domain
  STATION_CREATED: "StationCreatedV1",
  STATION_UPDATED: "StationUpdatedV1",
  STATION_DEACTIVATED: "StationDeactivatedV1",

  // route domain
  ROUTE_CREATED: "RouteCreatedV1",
  ROUTE_UPDATED: "RouteUpdatedV1",
  ROUTE_DELETED: "RouteDeletedV1",
  ROUTE_STATION_ADDED: "RouteStationAddedV1",
  ROUTE_STATION_UPDATED: "RouteStationUpdatedV1",
  ROUTE_STATION_REMOVED: "RouteStationRemovedV1",

  // schedule domain
  SCHEDULE_CREATED: "ScheduleCreatedV1",
  SCHEDULE_STATUS_CHANGED: "ScheduleStatusChangedV1",

  // inventory domain
  INVENTORY_SCHEDULE_PROJECTED: "InventoryScheduleProjectedV1",
  INVENTORY_SCHEDULE_STATUS_CHANGED: "InventoryScheduleStatusChangedV1",
  SEAT_AVAILABILITY_CHANGED: "SeatAvailabilityChangedV1",
  // booking ↔ inventory saga
  HOLD_SEATS_REQUESTED: "HoldSeatsRequestedV1",
  INVENTORY_SEATS_HELD: "SeatsHeldV1",
  INVENTORY_SEATS_HOLD_FAILED: "SeatsHoldFailedV1",
  INVENTORY_SEAT_HOLD_EXPIRED: "SeatHoldExpiredV1",
  // booking domain
  BOOKING_STATUS_CHANGED: "BookingStatusChangedV1",
  // booking → payment cancellation saga
  BOOKING_REFUND_REQUESTED: "BookingRefundRequestedV1",
  // payment domain
  PAYMENT_ORDER_CREATED: "PaymentOrderCreatedV1",
  PAYMENT_SUCCESS: "PaymentSuccessV1",
  PAYMENT_FAILED: "PaymentFailedV1",
  PAYMENT_REFUNDED: "PaymentRefundedV1",
} as const;
