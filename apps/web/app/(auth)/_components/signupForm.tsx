"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { RegisterSchema } from "@/lib/schemas/user-service/auth.schema"
import { PasswordInput } from "./passwordInput"
import { Loader2 } from "lucide-react"
import { sendOtp, type RegisterRequest } from "@/generated"
import { useMutation } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { getErrorMessage } from "@/lib/utils/error"

export function SignUpForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()

  const { mutate: sendOtpMutation, isPending } = useMutation({
    mutationFn: (payload: RegisterRequest) => sendOtp(payload),
    onSuccess: (response, variables) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "OTP Sent",
          description:
            response.message || "Verification code sent to your email.",
        })
        router.push(
          `/verify-email?email=${encodeURIComponent(variables.email)}`
        )
      } else {
        toast.add({
          type: "error",
          title: "Registration Error",
          description: response.message || "Failed to send OTP",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to send OTP. Please try again."
      )
      toast.add({
        type: "error",
        title: "Registration Error",
        description: message,
      })
    },
  })

  const form = useForm<RegisterRequest>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  })

  const onSubmit = (values: RegisterRequest) => {
    sendOtpMutation(values)
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
                    <h1 className="text-2xl font-bold">Create your account</h1>
                    <p className="text-balance text-muted-foreground">
                      Sign up to start using the platform
                    </p>
                  </div>

                  {/* First Name */}
                  <Field>
                    <FieldLabel htmlFor="firstName">First Name</FieldLabel>
                    <Input
                      id="firstName"
                      placeholder="First Name"
                      autoFocus
                      {...form.register("firstName")}
                    />
                    {form.formState.errors.firstName && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.firstName.message}
                      </p>
                    )}
                  </Field>

                  {/* Last Name */}
                  <Field>
                    <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
                    <Input
                      id="lastName"
                      placeholder="Last Name"
                      {...form.register("lastName")}
                    />
                    {form.formState.errors.lastName && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.lastName.message}
                      </p>
                    )}
                  </Field>

                  {/* Email */}
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      {...form.register("email")}
                    />
                    {form.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.email.message}
                      </p>
                    )}
                  </Field>

                  {/* Password */}
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <PasswordInput
                      id="password"
                      placeholder="••••••••"
                      {...form.register("password")}
                    />
                    {form.formState.errors.password && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.password.message}
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
                          Sending OTP...
                        </span>
                      ) : (
                        "Sign Up"
                      )}
                    </Button>
                  </div>

                  {/* Footer */}
                  <div className="text-center text-sm">
                    Already have an account?{" "}
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
