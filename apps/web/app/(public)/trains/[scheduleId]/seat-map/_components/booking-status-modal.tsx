"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  XCircle,
  Ticket,
  ShieldCheck,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { loadRazorpayScript } from "@/lib/razorpay"
import { useBookingEvents, usePayBooking, useVerifyPayment } from "../_hooks"

interface BookingStatusModalProps {
  readonly bookingId: string | null
  readonly initialPnr: string | null
  readonly open: boolean
  readonly onClose: () => void
}

/**
 * ## BookingStatusModal
 *
 * Real-time SSE status dialog showing live booking progress, seat-hold state,
 * countdown timer, and Razorpay checkout integration with verification.
 */
export function BookingStatusModal({
  bookingId,
  initialPnr,
  open,
  onClose,
}: BookingStatusModalProps) {
  const { latestStatus, events, isConnected } = useBookingEvents(bookingId)
  const payMutation = usePayBooking()
  const verifyMutation = useVerifyPayment()

  const [timerSeconds, setTimerSeconds] = useState(600) // 10 minute hold countdown
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const currentStatus = latestStatus ?? "PENDING"
  const pnr = events.find((e) => e.pnr)?.pnr ?? initialPnr ?? "FETCHING..."

  // Countdown timer for SEATS_HELD / PAYMENT_PENDING
  useEffect(() => {
    if (currentStatus !== "SEATS_HELD" && currentStatus !== "PAYMENT_PENDING") {
      return
    }

    const interval = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => clearInterval(interval)
  }, [currentStatus])

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? "0" : ""}${s}`
  }

  /**
   * Triggers Razorpay modal popup & performs verification on checkout success.
   */
  const handleRazorpayCheckout = async () => {
    if (!bookingId) return
    setPaymentError(null)
    setIsRazorpayLoading(true)

    try {
      // 1. Ensure Razorpay checkout.js script is loaded
      const isLoaded = await loadRazorpayScript()
      if (!isLoaded) {
        throw new Error(
          "Failed to load Razorpay SDK. Please check your network."
        )
      }

      // 2. Call payBooking endpoint to retrieve/create order
      const response = await payMutation.mutateAsync({ bookingId })
      const resData = (response as Record<string, unknown>).data as
        Record<string, unknown> | undefined

      const razorpayOrderId =
        (resData?.razorpayOrderId as string) || `order_${crypto.randomUUID()}`
      const paymentOrderId =
        (resData?.paymentOrderId as string) || crypto.randomUUID()
      const keyId =
        (resData?.keyId as string) ||
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
        "rzp_test_dummy"

      // 3. Open Razorpay Checkout Modal
      const options = {
        key: keyId,
        amount: 10000, // ₹100.00 in paise
        currency: "INR",
        name: "IRCTC Railway Booking",
        description: `Ticket Payment for PNR ${pnr}`,
        order_id: razorpayOrderId.startsWith("order_mock_")
          ? undefined
          : razorpayOrderId,
        handler: async (razorpayResponse: {
          razorpay_payment_id: string
          razorpay_order_id: string
          razorpay_signature: string
        }) => {
          try {
            await verifyMutation.mutateAsync({
              paymentOrderId,
              razorpayOrderId:
                razorpayResponse.razorpay_order_id || razorpayOrderId,
              razorpayPaymentId: razorpayResponse.razorpay_payment_id,
              razorpaySignature: razorpayResponse.razorpay_signature,
            })
          } catch (err) {
            setPaymentError(
              err instanceof Error
                ? err.message
                : "Payment verification failed."
            )
          }
        },
        prefill: {
          name: "IRCTC Passenger",
        },
        theme: {
          color: "#0284c7",
        },
      }

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options)
        rzp.on("payment.failed", (err: { error: { description: string } }) => {
          setPaymentError(err.error?.description || "Payment failed.")
        })
        rzp.open()
      } else {
        setPaymentError(
          "Razorpay SDK is not available. Please refresh the page."
        )
      }
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Razorpay payment error."
      )
    } finally {
      setIsRazorpayLoading(false)
    }
  }

  const isConfirmed = currentStatus === "CONFIRMED"
  const isFailed =
    currentStatus === "FAILED" ||
    currentStatus === "EXPIRED" ||
    currentStatus === "CANCELLED"
  const isHeld =
    currentStatus === "SEATS_HELD" || currentStatus === "PAYMENT_PENDING"
  const isPending = currentStatus === "PENDING"
  const isProcessing =
    payMutation.isPending || verifyMutation.isPending || isRazorpayLoading

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-lg sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Ticket className="h-6 w-6 text-primary" />
            Booking Reservation Status
          </DialogTitle>
          <DialogDescription>
            Live status stream via Server-Sent Events (SSE)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* PNR Banner */}
          <div className="flex items-center justify-between rounded-lg bg-muted p-3 font-mono text-sm">
            <span className="text-muted-foreground">PNR Number:</span>
            <span className="font-bold tracking-wider text-foreground">
              {pnr}
            </span>
          </div>

          {/* Status State Cards */}
          {isPending && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="space-y-1">
                <h4 className="font-semibold text-foreground">
                  Reserving Seats...
                </h4>
                <p className="text-xs text-muted-foreground">
                  Validating schedule and acquiring inventory seat hold locks.
                </p>
              </div>
            </div>
          )}

          {isHeld && (
            <div className="flex flex-col gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <h4 className="font-bold text-amber-900 dark:text-amber-200">
                    Seats Held Successfully!
                  </h4>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                    Your seats are locked for the next{" "}
                    <span className="font-mono font-bold text-amber-900 dark:text-amber-100">
                      {formatTimer(timerSeconds)}
                    </span>
                    . Complete payment to confirm your booking.
                  </p>
                </div>
              </div>

              {/* Payment Gateway Action Card */}
              <div className="space-y-3 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                    Razorpay Gateway
                  </span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Secured
                  </span>
                </div>

                {paymentError && (
                  <p className="rounded bg-destructive/10 p-2 text-center text-xs text-destructive">
                    {paymentError}
                  </p>
                )}

                <Button
                  type="button"
                  className="w-full gap-2 bg-sky-600 font-semibold text-white shadow-md hover:bg-sky-700"
                  onClick={handleRazorpayCheckout}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Opening Razorpay Checkout...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      Pay with Razorpay
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {isConfirmed && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-emerald-900 dark:text-emerald-200">
                  Booking Confirmed! 🎉
                </h4>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                  Your ticket has been confirmed and seat allocations recorded
                  in the inventory database.
                </p>
              </div>
              <Button
                type="button"
                className="mt-2 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={onClose}
              >
                Done
              </Button>
            </div>
          )}

          {isFailed && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center">
              <XCircle className="h-10 w-10 text-destructive" />
              <div className="space-y-1">
                <h4 className="font-bold text-destructive">
                  Booking Reservation Failed
                </h4>
                <p className="text-xs text-muted-foreground">
                  The seat hold expired or could not be processed by the
                  inventory service.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full"
                onClick={onClose}
              >
                Close & Try Again
              </Button>
            </div>
          )}

          {/* SSE Stream Log Trace */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Live Event Log</span>
              <span className="flex items-center gap-1.5 text-[11px] font-normal">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnected
                      ? "animate-pulse bg-emerald-500"
                      : "bg-muted-foreground"
                  }`}
                />
                {isConnected ? "SSE Connected" : "Connecting..."}
              </span>
            </div>

            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md bg-muted/60 p-2.5 font-mono text-[11px]">
              {events.length === 0 ? (
                <p className="text-muted-foreground italic">
                  Awaiting status events...
                </p>
              ) : (
                events.map((ev, i) => (
                  <div
                    key={ev.eventId || i}
                    className="flex items-center justify-between text-foreground/80"
                  >
                    <span>
                      {ev.previousStatus ? `${ev.previousStatus} → ` : ""}
                      <span className="font-bold text-primary">
                        {ev.currentStatus}
                      </span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      v{ev.version}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
