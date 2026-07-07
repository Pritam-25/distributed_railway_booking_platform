import otpGenerator from "otp-generator";

/**
 * Generates a random 6-digit OTP.
 * Pure utility function with no external dependencies.
 */
export const generateOtp = (): string => {
  return otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });
};
