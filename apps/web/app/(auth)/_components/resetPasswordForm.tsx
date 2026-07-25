"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { passwordSchema } from "@/lib/schemas/user-service/auth.schema"
import { PasswordInput } from "./passwordInput"
import { Loader2 } from "lucide-react"
import { resetPassword } from "@/generated"
import { useMutation } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { getErrorMessage } from "@/lib/utils/error"
import { z } from "zod"

interface ResetPasswordFormProps {
  token: string
  className?: string
}

const ResetPasswordFormSchema = z
  .object({
    passwordResetToken: z.uuid("Invalid reset token format"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type ResetFormValues = z.infer<typeof ResetPasswordFormSchema>

export function ResetPasswordForm({
  token = "",
  className,
  ...props
}: ResetPasswordFormProps & React.ComponentProps<"div">) {
  const router = useRouter()

  const { mutate: resetPasswordMutation, isPending } = useMutation({
    mutationFn: (payload: { passwordResetToken: string; password: string }) =>
      resetPassword(payload),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Password Updated",
          description:
            response.message ||
            "Your password has been reset successfully! Please log in.",
        })
        router.push("/login")
      } else {
        toast.add({
          type: "error",
          title: "Reset Failed",
          description: response.message || "Failed to reset password.",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to reset password. Please try again."
      )
      toast.add({
        type: "error",
        title: "Reset Failed",
        description: message,
      })
    },
  })

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(ResetPasswordFormSchema),
    defaultValues: {
      passwordResetToken: token,
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = (values: ResetFormValues) => {
    resetPasswordMutation({
      passwordResetToken: values.passwordResetToken,
      password: values.password,
    })
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="p-0">
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="w-full p-6 md:p-8"
          >
            <FieldGroup>
              <FieldSet>
                <div className="flex flex-col gap-6">
                  {/* Header */}
                  <div className="flex flex-col items-center text-center">
                    <h1 className="text-xl font-bold">Set New Password</h1>
                    <p className="text-balance text-muted-foreground">
                      Please enter and confirm your new password below
                    </p>
                  </div>

                  {/* New Password */}
                  <Field>
                    <FieldLabel htmlFor="password">New Password</FieldLabel>
                    <PasswordInput
                      id="password"
                      placeholder="••••••••"
                      autoFocus
                      {...form.register("password")}
                    />
                    {form.formState.errors.password && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.password.message}
                      </p>
                    )}
                  </Field>

                  {/* Confirm Password */}
                  <Field>
                    <FieldLabel htmlFor="confirmPassword">
                      Confirm Password
                    </FieldLabel>
                    <PasswordInput
                      id="confirmPassword"
                      placeholder="••••••••"
                      {...form.register("confirmPassword")}
                    />
                    {form.formState.errors.confirmPassword && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </Field>

                  {/* Submit */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="w-full cursor-pointer"
                      disabled={form.formState.isSubmitting || isPending}
                    >
                      {form.formState.isSubmitting || isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving password...
                        </span>
                      ) : (
                        "Reset Password"
                      )}
                    </Button>
                  </div>
                </div>
              </FieldSet>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
