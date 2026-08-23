"use client"

import { User, Trash2 } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import type { SeatMapSeat } from "@/generated"
import type { CreateBookingFormValues } from "@/lib/schemas/booking"

interface PassengerFormProps {
  readonly selectedSeats: SeatMapSeat[]
  readonly form: UseFormReturn<CreateBookingFormValues>
  readonly onDeselectSeat: (seatId: string) => void
}

/**
 * ## PassengerFormCard
 *
 * Form component rendering passenger details input cards for each selected seat.
 * Powered by React Hook Form + Zod validation.
 */
export function PassengerFormCard({
  selectedSeats,
  form,
  onDeselectSeat,
}: PassengerFormProps) {
  if (selectedSeats.length === 0) return null

  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form

  const passengersWatch = watch("passengers")

  return (
    <Card
      id="passenger-form-card"
      className="border-primary/20 bg-card shadow-sm"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <User className="h-5 w-5 text-primary" />
            Passenger Details ({selectedSeats.length} Seat
            {selectedSeats.length > 1 ? "s" : ""} Selected)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Provide passenger information for each seat. Maximum 6 seats per
            booking.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {selectedSeats.map((seat, index) => {
          const fieldError = errors.passengers?.[index]
          const currentGender = passengersWatch?.[index]?.gender ?? "MALE"
          const currentBerth =
            passengersWatch?.[index]?.berthPreference ?? "LOWER"

          return (
            <div
              key={seat.seatId}
              className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-sm font-medium">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span>Seat #{seat.seatNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    ({seat.seatType} · ₹{seat.price})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => onDeselectSeat(seat.seatId)}
                  title="Remove seat selection"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Full Name */}
                <div className="space-y-1">
                  <Label htmlFor={`name-${seat.seatId}`} className="text-xs">
                    Passenger Name *
                  </Label>
                  <Input
                    id={`name-${seat.seatId}`}
                    placeholder="e.g. Rahul Sharma"
                    {...register(`passengers.${index}.fullName`)}
                    className="h-9 text-sm"
                  />
                  {fieldError?.fullName && (
                    <p className="text-xs text-destructive">
                      {fieldError.fullName.message}
                    </p>
                  )}
                </div>

                {/* Age */}
                <div className="space-y-1">
                  <Label htmlFor={`age-${seat.seatId}`} className="text-xs">
                    Age *
                  </Label>
                  <Input
                    id={`age-${seat.seatId}`}
                    type="number"
                    min={1}
                    max={120}
                    {...register(`passengers.${index}.age`, {
                      valueAsNumber: true,
                    })}
                    className="h-9 font-mono text-sm"
                  />
                  {fieldError?.age && (
                    <p className="text-xs text-destructive">
                      {fieldError.age.message}
                    </p>
                  )}
                </div>

                {/* Gender */}
                <div className="space-y-1">
                  <Label htmlFor={`gender-${seat.seatId}`} className="text-xs">
                    Gender
                  </Label>
                  <Select
                    value={currentGender}
                    onValueChange={(val) =>
                      setValue(
                        `passengers.${index}.gender`,
                        val as "MALE" | "FEMALE" | "OTHER",
                        { shouldValidate: true }
                      )
                    }
                  >
                    <SelectTrigger
                      id={`gender-${seat.seatId}`}
                      className="h-9 text-sm"
                    >
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldError?.gender && (
                    <p className="text-xs text-destructive">
                      {fieldError.gender.message}
                    </p>
                  )}
                </div>

                {/* Berth Preference */}
                <div className="space-y-1">
                  <Label htmlFor={`berth-${seat.seatId}`} className="text-xs">
                    Berth Preference
                  </Label>
                  <Select
                    value={currentBerth ?? "LOWER"}
                    onValueChange={(val) =>
                      setValue(
                        `passengers.${index}.berthPreference`,
                        val as
                          | "LOWER"
                          | "MIDDLE"
                          | "UPPER"
                          | "SIDE_LOWER"
                          | "SIDE_UPPER"
                          | "NO_PREFERENCE",
                        { shouldValidate: true }
                      )
                    }
                  >
                    <SelectTrigger
                      id={`berth-${seat.seatId}`}
                      className="h-9 text-sm"
                    >
                      <SelectValue placeholder="Berth preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOWER">Lower</SelectItem>
                      <SelectItem value="MIDDLE">Middle</SelectItem>
                      <SelectItem value="UPPER">Upper</SelectItem>
                      <SelectItem value="SIDE_LOWER">Side Lower</SelectItem>
                      <SelectItem value="SIDE_UPPER">Side Upper</SelectItem>
                      <SelectItem value="NO_PREFERENCE">
                        No Preference
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
