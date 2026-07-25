"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ForgotPasswordRequestSchema } from "@/lib/schemas/user-service/auth.schema"
import { Loader2 } from "lucide-react"
import { forgotPassword, type ForgotPasswordRequest } from "@/generated"
import { useMutation } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { getErrorMessage } from "@/lib/utils/error"

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()

  const { mutate: forgotPasswordMutation, isPending } = useMutation({
    mutationFn: (payload: ForgotPasswordRequest) => forgotPassword(payload),
    onSuccess: (response, variables) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "OTP Sent",
          description:
            response.message || "Verification code sent to your email.",
        })
        const sessionId = response.data.sessionId
        router.push(
          `/forgot-password/verify?email=${encodeURIComponent(
            variables.email
          )}&sessionId=${encodeURIComponent(sessionId)}`
        )
      } else {
        toast.add({
          type: "error",
          title: "Request Failed",
          description:
            response.message || "Failed to request password reset OTP.",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to send reset code. Please try again."
      )
      toast.add({
        type: "error",
        title: "Request Error",
        description: message,
      })
    },
  })

  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
    defaultValues: {
      email: "",
    },
  })

  const onSubmit = (values: ForgotPasswordRequest) => {
    forgotPasswordMutation(values)
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
                    <h1 className="text-xl font-bold">Reset Password</h1>
                    <p className="text-balance text-muted-foreground">
                      Enter your email address to request a reset code
                    </p>
                  </div>

                  {/* Email */}
                  <Field>
                    <FieldLabel htmlFor="email">Email Address</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      autoFocus
                      {...form.register("email")}
                    />
                    {form.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.email.message}
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
                          Sending reset code...
                        </span>
                      ) : (
                        "Request Reset Code"
                      )}
                    </Button>
                  </div>

                  {/* Footer */}
                  <div className="text-center text-sm">
                    Remembered your password?{" "}
                    <Link
                      href="/login"
                      className="underline underline-offset-4"
                    >
                      Login
                    </Link>
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
