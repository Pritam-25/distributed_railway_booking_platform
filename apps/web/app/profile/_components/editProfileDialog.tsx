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
import { Loader2 } from "lucide-react"
import { useEffect, useRef } from "react"
import {
  UpdateProfileSchema,
  type UpdateProfileFormValues,
} from "@/lib/schemas"
import { useUpdateProfileMutation } from "../_hooks"

interface EditProfileDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  defaultValues: UpdateProfileFormValues
}

export function EditProfileDialog({
  isOpen,
  onOpenChange,
  defaultValues,
}: EditProfileDialogProps) {
  const wasOpenRef = useRef(false)

  const form = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues,
  })

  // Reset form values only when transitioning from closed to open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      form.reset(defaultValues)
    }
    wasOpenRef.current = isOpen
  }, [isOpen, defaultValues, form])

  const { mutate: updateProfileMutation, isPending } = useUpdateProfileMutation(
    () => onOpenChange(false)
  )

  const onSubmit = (values: UpdateProfileFormValues) => {
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
