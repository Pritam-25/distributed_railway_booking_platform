"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldSeparator,
} from "@/components/ui/field"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LoginFormSchema } from "@/lib/schemas"
import { PasswordInput } from "./passwordInput"
import { Loader2 } from "lucide-react"
import { type LoginRequest } from "@/generated"
import { toast } from "@/components/ui/toast"
import { useSearchParams } from "next/navigation"
import { useLoginMutation } from "../_hooks"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const searchParams = useSearchParams()
  const redirectTarget = searchParams.get("redirect") || "/profile"

  const { mutate: loginMutation, isPending } = useLoginMutation({
    redirectTarget,
  })

  const form = useForm<LoginRequest>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = (values: LoginRequest) => {
    loginMutation(values)
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
                    <h1 className="text-xl font-bold">Welcome back</h1>
                    <p className="text-balance text-muted-foreground">
                      Login with your IRCTC account
                    </p>
                  </div>

                  {/* Google Login */}
                  <Field>
                    <Button
                      variant="outline"
                      type="button"
                      className="flex w-full items-center justify-center gap-2"
                      onClick={() =>
                        toast.add({
                          type: "info",
                          title: "OAuth Sign-In",
                          description:
                            "Google authentication is not implemented yet.",
                        })
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                      >
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      Login with Google
                    </Button>
                  </Field>

                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                    Or continue with
                  </FieldSeparator>

                  {/* Email */}
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
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

                  {/* Password */}
                  <Field>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Link
                        href="/forgot-password"
                        className="text-xs underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </div>
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
                          Logging in...
                        </span>
                      ) : (
                        "Login"
                      )}
                    </Button>
                  </div>

                  {/* Footer */}
                  <div className="text-center text-sm">
                    Don&apos;t have an account?{" "}
                    <Link
                      href="/signup"
                      className="underline underline-offset-4"
                    >
                      Sign up
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
