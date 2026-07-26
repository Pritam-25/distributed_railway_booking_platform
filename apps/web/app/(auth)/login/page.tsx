import { Suspense } from "react"
import { LoginForm } from "@/app/(auth)/_components/loginForm"
import { LoginFormSkeleton } from "@/app/(auth)/_components/loginFormSkeleton"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-md">
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
