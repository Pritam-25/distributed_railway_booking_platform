import { Train } from "lucide-react"

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6 md:p-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
          <Train className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome to IRCTC
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Distributed Railway Booking Platform
        </p>
      </div>
    </div>
  )
}
