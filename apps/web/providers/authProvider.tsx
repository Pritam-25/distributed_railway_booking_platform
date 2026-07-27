"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { UserResponse } from "@/generated"

interface AuthContextValue {
  user: UserResponse
  refetch: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  user: UserResponse
  refetch: () => void
  children: ReactNode
}

/**
 * Provider that exposes the authenticated user context to all components
 * under protected layouts without prop drilling or redundant network queries.
 */
export function AuthProvider({ user, refetch, children }: AuthProviderProps) {
  return (
    <AuthContext.Provider value={{ user, refetch }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to consume the authenticated user from AuthContext.
 * Guaranteed to return a valid user when invoked inside protected routes.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error(
      "useAuth must be used within an AuthProvider (inside protected routes)"
    )
  }
  return context
}
