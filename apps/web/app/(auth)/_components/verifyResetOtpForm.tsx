"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { VerifyResetOtpRequestSchema } from "@/lib/schemas/user-service/auth.schema"
import { Loader2, ShieldCheck } from "lucide-react"
import { verifyResetOtp, type VerifyResetOtpRequest } from "@/generated"
import { useMutation } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { getErrorMessage } from "@/lib/utils/error"

interface VerifyResetOtpFormProps {
  email?: string
  sessionId?: string
  className?: string
}

export function VerifyResetOtpForm({
  email = "",
  sessionId = "",
  className,
  ...props
}: VerifyResetOtpFormProps & React.ComponentProps<"div">) {
  const router = useRouter()

  const { mutate: verifyResetOtpMutation, isPending: isVerifying } =
    useMutation({
      mutationFn: (payload: VerifyResetOtpRequest) => verifyResetOtp(payload),
      onSuccess: (response) => {
        if (response.success) {
          toast.add({
            type: "success",
            title: "OTP Verified",
            description:
              response.message ||
              "OTP verified successfully. You can now set your new password.",
          })
          const resetToken = response.data.passwordResetToken
          router.push(
            `/forgot-password/reset?token=${encodeURIComponent(resetToken)}`
          )
        } else {
          toast.add({
            type: "error",
            title: "Verification Failed",
            description: response.message || "Invalid or expired OTP",
          })
        }
      },
      onError: (error) => {
        const message = getErrorMessage(error, "Invalid or expired OTP code.")
        toast.add({
          type: "error",
          title: "Verification Failed",
          description: message,
        })
      },
    })

  const form = useForm<VerifyResetOtpRequest>({
    resolver: zodResolver(VerifyResetOtpRequestSchema),
    defaultValues: {
      sessionId,
      otp: "",
    },
  })

  const onSubmit = (values: VerifyResetOtpRequest) => {
    verifyResetOtpMutation(values)
  }

  const handleResendOtp = () => {
    toast.add({
      type: "info",
      title: "Resend Verification Code",
      description: "Redirecting back to password reset request page.",
    })
    const queryString = email ? `?email=${encodeURIComponent(email)}` : ""
    router.push(`/forgot-password${queryString}`)
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
                  {/* Icon & Header */}
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <ShieldCheck className="h-6 w-6 text-primary" />
                    </div>
                    <h1 className="text-xl font-bold">Verify Reset Code</h1>
                    <p className="mt-1 text-sm text-balance text-muted-foreground">
                      {email
                        ? `Enter the 6-digit verification code sent to ${email}`
                        : "Enter the 6-digit verification code sent to your email"}
                    </p>
                  </div>

                  {form.formState.errors.sessionId && (
                    <p className="rounded-md bg-destructive/15 p-3 text-center text-sm font-medium text-destructive">
                      {form.formState.errors.sessionId.message ||
                        "Invalid or missing session link. Please request a new OTP."}
                    </p>
                  )}

                  {/* 6-Digit OTP Box Input */}
                  <Field className="flex flex-col items-center justify-center text-center">
                    <FieldLabel
                      htmlFor="otp"
                      className="mb-2 justify-center text-center"
                    >
                      6-Digit Verification Code
                    </FieldLabel>

                    <div className="flex w-full justify-center py-2">
                      <Controller
                        control={form.control}
                        name="otp"
                        render={({ field }) => (
                          <InputOTP
                            maxLength={6}
                            value={field.value}
                            onChange={field.onChange}
                            autoFocus
                          >
                            <InputOTPGroup>
                              <InputOTPSlot index={0} />
                              <InputOTPSlot index={1} />
                              <InputOTPSlot index={2} />
                              <InputOTPSlot index={3} />
                              <InputOTPSlot index={4} />
                              <InputOTPSlot index={5} />
                            </InputOTPGroup>
                          </InputOTP>
                        )}
                      />
                    </div>

                    {form.formState.errors.otp && (
                      <p className="mt-2 text-center text-sm text-destructive">
                        {form.formState.errors.otp.message}
                      </p>
                    )}
                  </Field>

                  {/* Submit Button */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="w-full cursor-pointer"
                      disabled={form.formState.isSubmitting || isVerifying}
                    >
                      {form.formState.isSubmitting || isVerifying ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Verifying code...
                        </span>
                      ) : (
                        "Verify Reset Code"
                      )}
                    </Button>
                  </div>

                  {/* Resend OTP & Back to Request Page */}
                  <div className="flex flex-col items-center gap-2 text-center text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>Didn&apos;t receive code?</span>
                      <Button
                        type="button"
                        variant="link"
                        onClick={handleResendOtp}
                        className="h-auto p-0 text-sm font-normal underline-offset-4"
                      >
                        Resend Code
                      </Button>
                    </div>

                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Back to Reset Request
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
