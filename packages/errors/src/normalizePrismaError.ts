import { ERROR_CODES, type ErrorCode } from "./errorCodes.js";

/**
 * Shape of a Prisma known request error containing a database error code.
 */
type PrismaKnownError = { code: string };

/**
 * Checks if the given error is a known Prisma error (e.g. starts with P followed by 4 digits).
 * @param error The error to check.
 * @returns True if the error is a Prisma known error.
 */
export const isPrismaKnownError = (
  error: unknown,
): error is PrismaKnownError => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^P\d{4}$/.test(code);
};

/**
 * Normalizes a known Prisma database error into a corresponding API ErrorCode.
 * @param error The error to normalize.
 * @returns The matched ErrorCode, or null if the error is not a Prisma error.
 */
export const normalizePrismaError = (error: unknown): ErrorCode | null => {
  if (!isPrismaKnownError(error)) {
    return null;
  }

  switch (error.code) {
    case "P2002":
      return ERROR_CODES.CONFLICT;

    case "P2025":
      return ERROR_CODES.NOT_FOUND;

    case "P2003":
      return ERROR_CODES.INVALID_INPUT;

    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
};
