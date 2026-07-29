import { emailSchema, firstNameSchema, lastNameSchema, uuidSchema } from "@dto";
import "@irctc/openapi";
import { z } from "zod";

/**
 * Schema for User Response DTO
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
 * Schema for validating user profile update requests.
 */
export const UpdateProfileSchema = z
  .object({
    firstName: firstNameSchema,
    lastName: lastNameSchema,
  })
  .openapi("UpdateProfileRequest");

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
