"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ResetPasswordFormSchema } from "@/lib/schemas"
import { PasswordInput } from "./passwordInput"
import { Loader2 } from "lucide-react"
import { useResetPasswordMutation } from "@/app/(auth)/_hooks"
import { ResetPasswordRequest } from "@/generated"

interface ResetPasswordFormProps {
  token: string
  className?: string
}

export function ResetPasswordForm({
  token = "",
  className,
  ...props
}: ResetPasswordFormProps & React.ComponentProps<"div">) {
  const { mutate: resetPasswordMutation, isPending } =
    useResetPasswordMutation()

  const form = useForm<ResetPasswordRequest>({
    resolver: zodResolver(ResetPasswordFormSchema),
    defaultValues: {
      passwordResetToken: token,
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = (values: ResetPasswordRequest) => {
    resetPasswordMutation(values)
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

                  {form.formState.errors.passwordResetToken && (
                    <p className="rounded-md bg-destructive/15 p-3 text-center text-sm font-medium text-destructive">
                      {form.formState.errors.passwordResetToken.message ||
                        "Invalid or missing password reset link. Please request a new link."}
                    </p>
                  )}

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
