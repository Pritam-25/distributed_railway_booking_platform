"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff } from "lucide-react"

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  withToggleButton?: boolean
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(({ className, withToggleButton = true, ...props }, ref) => {
  const [show, setShow] = React.useState(false)

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        className={cn("pr-10", className)}
        ref={ref}
        {...props}
      />
      {withToggleButton && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShow((prev) => !prev)}
          aria-pressed={show}
          aria-label={show ? "Hide password" : "Show password"}
          title={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  )
})

PasswordInput.displayName = "PasswordInput"
