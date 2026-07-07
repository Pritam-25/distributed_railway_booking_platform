import otpGenerator from "otp-generator";

/**
 * Generates a random 6-digit OTP.
 *
 * @returns A 6-digit numeric OTP string.
 */
export const generateOtp = (): string => {
  return otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });
};
