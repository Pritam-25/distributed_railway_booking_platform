import { NextResponse, type NextRequest } from "next/server"

/**
 * Guest-only auth routes (authenticated users are redirected to /profile)
 */
const GUEST_ONLY_ROUTES = ["/login", "/signup"]

/**
 * Protected application routes (unauthenticated users are redirected to /login)
 */
const PROTECTED_ROUTES = ["/profile"]

/**
 * Fast, cookie-only optimistic route protection proxy for Next.js.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const accessToken = request.cookies.get("access_token")?.value
  const refreshToken = request.cookies.get("refresh_token")?.value

  // Optimistic authentication check (valid if client has either token)
  const isAuthenticated = !!refreshToken || !!accessToken

  // 1. Guest-only routes (/login, /signup): Redirect to /profile if authenticated
  if (
    isAuthenticated &&
    GUEST_ONLY_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    return NextResponse.redirect(new URL("/profile", request.url))
  }

  // 2. Protected routes (/profile, /sessions, etc.): Redirect to /login if no auth cookies
  if (
    !isAuthenticated &&
    PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/profile/:path*", "/login", "/signup"],
}
