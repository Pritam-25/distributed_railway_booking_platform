import { emailSchema, firstNameSchema, lastNameSchema, uuidSchema } from "@dto";
import "@irctc/openapi";
import { z } from "zod";

/**
 * Public user profile response payload.
 */
export const UserResponseSchema = z
  .object({
    id: uuidSchema("User ID must be a valid UUID"),
    firstName: firstNameSchema,
    lastName: lastNameSchema,
    email: emailSchema,
    createdAt: z.date().openapi({ example: "2026-07-24T00:00:00.000Z" }),
  })
  .openapi("UserResponse");

export type UserResponseDto = z.infer<typeof UserResponseSchema>;

/**
 * Profile update request body schema. At least one updatable field
 * (`firstName`, `lastName`) must be supplied.
 */
export const UpdateProfileSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
  })
  .refine(
    (data) => data.firstName !== undefined || data.lastName !== undefined,
    {
      message: "At least one field must be provided.",
    },
  )
  .openapi("UpdateProfileRequest");

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
