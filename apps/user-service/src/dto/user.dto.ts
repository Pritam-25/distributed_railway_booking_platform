import "@irctc/openapi";
import { z } from "zod";

/**
 * Schema for User Response DTO
 */
export const UserResponseSchema = z
  .object({
    id: z.uuid().openapi({
      format: "uuid",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    firstName: z.string().openapi({ example: "Jhon" }),
    lastName: z.string().openapi({ example: "Doe" }),
    email: z
      .email("Invalid email format")
      .trim()
      .openapi({ example: "jhon@example.com" }),
    createdAt: z
      .union([z.date(), z.string()])
      .openapi({ example: "2026-07-24T00:00:00.000Z" }),
  })
  .openapi("UserResponse");

export type UserResponseDto = z.infer<typeof UserResponseSchema>;

/**
 * Schema for validating user profile update requests.
 */
export const UserUpdateSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(3, "First name must be at least 3 characters long")
      .max(50, "First name must not exceed 50 characters")
      .optional()
      .openapi({ example: "Jhon" }),
    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters long")
      .max(50, "Last name must not exceed 50 characters")
      .optional()
      .openapi({ example: "Doe" }),
  })
  .openapi("UserUpdateRequest");

export type UserUpdateDto = z.infer<typeof UserUpdateSchema>;
