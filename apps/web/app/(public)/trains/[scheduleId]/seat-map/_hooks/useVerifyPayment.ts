"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import customInstance from "@/lib/api-client"

export interface VerifyPaymentInput {
  paymentOrderId: string
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

export interface VerifyPaymentResponse {
  success: boolean
  message: string
  data?: {
    paymentId: string
    status: string
  }
}

/**
 * ## useVerifyPayment
 *
 * Mutation hook for sending client-side Razorpay checkout signature
 * verification details to `POST /api/v1/payments/verify`.
 */
export function useVerifyPayment() {
  const queryClient = useQueryClient()

  return useMutation<VerifyPaymentResponse, Error, VerifyPaymentInput>({
    mutationFn: (input) => {
      return customInstance<VerifyPaymentResponse>({
        url: "/api/v1/payments/verify",
        method: "POST",
        data: input,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}
