import { z } from "zod";

export interface UserResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
}

/**
 * Schema for validating user profile update requests.
 */
export const UserUpdateSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(3, "First name must be at least 3 characters long")
    .optional(),
  lastName: z
    .string()
    .trim()
    .min(2, "Last name must be at least 2 characters long")
    .optional(),
});

export type UserUpdateDto = z.infer<typeof UserUpdateSchema>;
