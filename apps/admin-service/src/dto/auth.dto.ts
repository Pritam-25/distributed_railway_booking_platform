import "@irctc/openapi";
import { z } from "zod";

/**
 * Zod validation schema and DTO for admin login request.
 */
export const adminLoginSchema = z.object({
  email: z
    .email("Invalid email format")
    .trim()
    .openapi({ example: "jhon@example.com" }),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/\d/, "Password must contain at least one number")
    .regex(
      /[^a-zA-Z0-9]/,
      "Password must contain at least one special character",
    )
    .openapi({
      pattern: String.raw`^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$`,
      example: "Password@123",
      description:
        "### Password Requirements\n\n- Minimum **8** characters\n- At least **1 uppercase** letter\n- At least **1 number**\n- At least **1 special character**",
    }),
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
