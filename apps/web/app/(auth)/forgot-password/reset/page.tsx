import { ResetPasswordForm } from "@/app/(auth)/_components/resetPasswordForm"

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-md">
        <ResetPasswordForm token={token ?? ""} />
      </div>
    </div>
  )
}
