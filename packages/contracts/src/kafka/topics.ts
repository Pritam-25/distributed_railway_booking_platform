export const KAFKA_TOPICS = {
  // ------------ user domain ------------
  USER_OTP_REQUESTED: "user.otp-requested.v1",
  USER_LOGGED_IN: "user.logged-in.v1",

  // ------------ admin domain ------------

  // train related events
  TRAIN_CREATED: "admin.train-created.v1",
  TRAIN_UPDATED: "admin.train-updated.v1",
  TRAIN_DEACTIVATED: "admin.train-deactivated.v1",
} as const;
