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
import { VerifyOtpFormSchema } from "@/lib/schemas"
import { Loader2, Mail } from "lucide-react"
import { type VerifyOtpRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useVerifyOtpMutation } from "@/app/(auth)/_hooks"

interface VerifyEmailFormProps {
  email?: string
  className?: string
}

export default function VerifyEmailForm({
  email = "",
  className,
  ...props
}: VerifyEmailFormProps & React.ComponentProps<"div">) {
  const router = useRouter()
  const { mutate: verifyOtpMutation, isPending: isVerifying } =
    useVerifyOtpMutation()

  const form = useForm<VerifyOtpRequest>({
    resolver: zodResolver(VerifyOtpFormSchema),
    defaultValues: {
      otp: "",
    },
  })

  const onSubmit = (values: VerifyOtpRequest) => {
    verifyOtpMutation(values)
  }

  const handleResendOtp = () => {
    toast.add({
      type: "info",
      title: "Resend Verification",
      description:
        "Please resubmit your registration details to receive a new OTP.",
    })
    const queryString = email ? `?email=${encodeURIComponent(email)}` : ""
    router.push(`/signup${queryString}`)
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
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <h1 className="text-xl font-bold">Verify Your Email</h1>
                    <p className="mt-1 text-sm text-balance text-muted-foreground">
                      {email
                        ? `Please enter the 6-digit code sent to ${email}`
                        : "Please enter the 6-digit code sent to your email"}
                    </p>
                  </div>

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
                          Verifying...
                        </span>
                      ) : (
                        "Verify & Complete Registration"
                      )}
                    </Button>
                  </div>

                  {/* Resend OTP & Back to Signup */}
                  <div className="flex flex-col items-center gap-2 text-center text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>Didn&apos;t receive code?</span>
                      <Button
                        type="button"
                        variant="link"
                        onClick={handleResendOtp}
                        className="h-auto p-0 text-sm font-normal underline-offset-4"
                      >
                        Resend OTP
                      </Button>
                    </div>

                    <Link
                      href="/signup"
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Back to Registration
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
