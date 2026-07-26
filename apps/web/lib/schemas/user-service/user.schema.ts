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
 * Schema for validating user profile edit form inputs.
 */
export const UpdateProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(3, "First name must be at least 3 characters")
    .max(50, "First name must not exceed 50 characters"),
  lastName: z
    .string()
    .trim()
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must not exceed 50 characters"),
})

export type UpdateProfileFormValues = z.infer<typeof UpdateProfileSchema>
