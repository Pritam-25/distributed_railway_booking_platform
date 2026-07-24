import VerifyEmailForm from "@/app/(auth)/_components/verifyEmailForm"

interface PageProps {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { email } = await searchParams

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        <VerifyEmailForm email={email} />
      </div>
    </div>
  )
}
