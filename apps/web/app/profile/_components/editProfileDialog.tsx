"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateProfile } from "@/generated/endpoints/user-profile/user-profile"
import { toast } from "@/components/ui/toast"
import { getErrorMessage } from "@/lib/utils/error"
import { useEffect } from "react"

const UpdateProfileFormSchema = z.object({
  firstName: z
    .string()
    .min(3, "First name must be at least 3 characters")
    .max(50, "First name must not exceed 50 characters"),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must not exceed 50 characters"),
})

type FormValues = z.infer<typeof UpdateProfileFormSchema>

interface EditProfileDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  defaultValues: FormValues
}

export function EditProfileDialog({
  isOpen,
  onOpenChange,
  defaultValues,
}: EditProfileDialogProps) {
  const queryClient = useQueryClient()

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateProfileFormSchema),
    defaultValues,
  })

  // Reset form values when defaults change or when dialog opens
  useEffect(() => {
    if (isOpen) {
      form.reset(defaultValues)
    }
  }, [isOpen, defaultValues, form])

  const { mutate: updateProfileMutation, isPending } = useMutation({
    mutationFn: (payload: FormValues) => updateProfile(payload),
    onSuccess: (response) => {
      if (response.success) {
        toast.add({
          type: "success",
          title: "Profile Updated",
          description:
            response.message || "Your profile has been updated successfully.",
        })
        queryClient.invalidateQueries({ queryKey: ["user-profile"] })
        onOpenChange(false)
      } else {
        toast.add({
          type: "error",
          title: "Update Failed",
          description: response.message || "Failed to update profile.",
        })
      }
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        "Failed to update profile. Please try again."
      )
      toast.add({
        type: "error",
        title: "Update Failed",
        description: message,
      })
    },
  })

  const onSubmit = (values: FormValues) => {
    updateProfileMutation(values)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Modify your personal details here. Click save when you are done.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
          <FieldGroup className="space-y-4">
            {/* First Name */}
            <Field>
              <FieldLabel htmlFor="firstName">First Name</FieldLabel>
              <Input
                id="firstName"
                placeholder="John"
                {...form.register("firstName")}
                disabled={isPending}
              />
              {form.formState.errors.firstName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </Field>

            {/* Last Name */}
            <Field>
              <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
              <Input
                id="lastName"
                placeholder="Doe"
                {...form.register("lastName")}
                disabled={isPending}
              />
              {form.formState.errors.lastName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.lastName.message}
                </p>
              )}
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="cursor-pointer"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
