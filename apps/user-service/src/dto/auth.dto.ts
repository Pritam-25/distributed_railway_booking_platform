import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(
    /[@$#!%*~?&/\\(){}[\]]/,
    "Password must contain at least one special character",
  );

export const RegisterSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(3, "First name must be at least 3 characters long"),
    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters long"),
    email: z.email("Invalid email format").trim(),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterRequestDto = z.infer<typeof RegisterSchema>;
