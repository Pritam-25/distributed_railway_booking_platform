"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import customInstance from "@/lib/api-client"
import type { BookingsCreateBooking201 } from "@/generated/model/bookingsCreateBooking201"
import type { CreateBookingRequest } from "@/generated/model/createBookingRequest"

export type CreateBookingInput = Omit<
  CreateBookingRequest,
  "idempotencyKey"
> & {
  idempotencyKey?: string
}

/**
 * ## useCreateBooking
 *
 * Mutation hook for initiating a booking in the `PENDING` state via `POST /api/v1/bookings`.
 * Automatically generates a client-side UUID `idempotencyKey` if not supplied.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient()

  return useMutation<BookingsCreateBooking201, Error, CreateBookingInput>({
    mutationFn: (input) => {
      const payload: CreateBookingRequest = {
        ...input,
        idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
      }

      return customInstance<BookingsCreateBooking201>({
        url: "/api/v1/bookings",
        method: "POST",
        data: payload,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}

/**
 * ## usePayBooking
 *
 * Mutation hook for simulating payment completion via `POST /api/v1/bookings/:bookingId/pay`.
 */
export function usePayBooking() {
  const queryClient = useQueryClient()

  return useMutation<BookingsCreateBooking201, Error, { bookingId: string }>({
    mutationFn: ({ bookingId }) => {
      return customInstance<BookingsCreateBooking201>({
        url: `/api/v1/bookings/${bookingId}/pay`,
        method: "POST",
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}
