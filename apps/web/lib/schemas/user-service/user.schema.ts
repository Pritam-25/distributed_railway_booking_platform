import { z } from "zod"

/**
 * Schema for User Response DTO
 */
export const UserResponseSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email("Invalid email format").trim(),
  createdAt: z.union([z.date(), z.string()]),
})

/**
 * Schema for validating user profile update requests.
 */
export const UserUpdateSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(3, "First name must be at least 3 characters long")
    .max(50, "First name must not exceed 50 characters")
    .optional(),
  lastName: z
    .string()
    .trim()
    .min(2, "Last name must be at least 2 characters long")
    .max(50, "Last name must not exceed 50 characters")
    .optional(),
})
