import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

export type AdminLoginRequestDto = z.infer<typeof adminLoginSchema>;

export interface AdminAuthResponseDto {
  admin: {
    id: string;
    email: string;
  };
  accessToken: string;
}
