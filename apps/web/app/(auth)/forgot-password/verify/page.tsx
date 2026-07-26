import { redirect } from "next/navigation"
import { VerifyResetOtpForm } from "@/app/(auth)/_components/verifyResetOtpForm"

interface PageProps {
  searchParams: Promise<{ email?: string; sessionId?: string }>
}

export default async function VerifyResetOtpPage({ searchParams }: PageProps) {
  const { email, sessionId } = await searchParams

  if (!sessionId) {
    redirect("/forgot-password")
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-md">
        <VerifyResetOtpForm email={email} sessionId={sessionId} />
      </div>
    </div>
  )
}
