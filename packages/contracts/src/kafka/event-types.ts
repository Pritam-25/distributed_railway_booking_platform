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
} as const;
