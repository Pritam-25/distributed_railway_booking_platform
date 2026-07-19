import { z } from "zod";

/**
 * Zod validation schema and DTO for admin login request.
 */
export const adminLoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

export type AdminLoginRequestDto = z.infer<typeof adminLoginSchema>;

/**
 * DTO interface for admin authentication response.
 */
export interface AdminAuthResponseDto {
  admin: {
    id: string;
    email: string;
  };
  accessToken: string;
}
