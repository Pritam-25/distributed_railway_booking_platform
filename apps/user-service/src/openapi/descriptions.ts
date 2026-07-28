import { buildEndpointDoc } from "@irctc/openapi";

export const userServiceOpenApiDescriptions = {
  auth: {
    sendOtp: buildEndpointDoc({
      summary: "Send OTP for User Registration",
      overview:
        "Starts the registration flow by validating the submitted identity and password payload, then dispatching a one-time password to the provided email address.",
      requestBodyFields: [
        "`firstName` - User's given name used to personalize the account.",
        "`lastName` - User's family name used together with the first name.",
        "`email` - Unique email address that receives the registration OTP.",
        "`password` - Account password validated against the password policy.",
      ],
      response:
        "Returns a success envelope with an empty data payload. The short-lived OTP session is stored by the service and the OTP session cookie is set separately.",
      outcomes: [
        "200 OK - OTP was generated and sent to the registered email address.",
        "409 Conflict - The email is already registered.",
        "400 Bad Request - Request validation failed or the payload is incomplete.",
        "429 Too Many Requests - OTP delivery was rate-limited.",
        "500 Internal Server Error - The service could not complete OTP dispatch.",
      ],
    }),
    verifyOtp: buildEndpointDoc({
      summary: "Verify OTP & Complete Registration",
      overview:
        "Validates the registration OTP, creates the user account, and completes the sign-up flow for the current OTP session.",
      requestBodyFields: [
        "`otp` - The 6-digit one-time password sent to the user's email address.",
      ],
      response:
        "Returns the created user in the response body and sets the access and refresh token cookies for immediate authentication.",
      outcomes: [
        "200 OK - Registration succeeded and the user is authenticated.",
        "400 Bad Request - The OTP session is missing or the OTP is invalid or expired.",
        "429 Too Many Requests - OTP verification was rate-limited.",
        "500 Internal Server Error - The service could not complete registration.",
      ],
      notes: [
        "The response body contains the user profile; authentication tokens are delivered through cookies.",
      ],
    }),
    login: buildEndpointDoc({
      summary: "Login User",
      overview:
        "Authenticates an existing user with email and password credentials, then rotates the active session cookies on success.",
      requestBodyFields: [
        "`email` - Registered email address used to locate the account.",
        "`password` - Account password that must satisfy the password policy.",
      ],
      response:
        "Returns the user profile in the response body and sets fresh access and refresh token cookies for subsequent authenticated requests.",
      outcomes: [
        "200 OK - Credentials were accepted and a new authenticated session was created.",
        "400 Bad Request - The request body failed validation.",
        "401 Unauthorized - The credentials were invalid.",
        "429 Too Many Requests - Login attempts were rate-limited.",
        "500 Internal Server Error - The service could not complete authentication.",
      ],
    }),
    refreshToken: buildEndpointDoc({
      summary: "Refresh Access Token",
      overview:
        "Uses the refresh token from the current session to rotate credentials and issue a new access token pair.",
      requestBodyFields: [
        "None - The refresh token is read from the HTTP-only refresh cookie.",
      ],
      response:
        "Returns the refreshed user profile in the response body while issuing new access and refresh token cookies.",
      outcomes: [
        "200 OK - The session was refreshed successfully.",
        "400 Bad Request - The request could not be processed.",
        "401 Unauthorized - The refresh token was missing, invalid, or expired.",
        "429 Too Many Requests - Token refresh was rate-limited.",
        "500 Internal Server Error - The service could not rotate the session.",
      ],
      notes: ["The endpoint does not accept a request body."],
    }),
    getSessions: buildEndpointDoc({
      summary: "Get Active User Sessions",
      overview:
        "Retrieves the list of active sessions for the authenticated user and marks the currently requested session in the returned payload.",
      requestBodyFields: [
        "None - The authenticated user is resolved from the access token or session cookie.",
      ],
      response:
        "Returns an array of session summaries with device metadata, IP address, location, timestamps, and an `isCurrent` flag.",
      outcomes: [
        "200 OK - Active sessions were retrieved successfully.",
        "400 Bad Request - The request could not be validated.",
        "401 Unauthorized - Authentication credentials were missing or invalid.",
        "429 Too Many Requests - Session lookup was rate-limited.",
        "500 Internal Server Error - The service could not load session data.",
      ],
    }),
    revokeSession: buildEndpointDoc({
      summary: "Revoke Active Session",
      overview:
        "Revokes a single active session by session ID so a user can sign out one device without affecting the others.",
      requestBodyFields: [
        "`sessionId` - Path parameter that identifies the session to revoke.",
      ],
      response:
        "Returns a success envelope with an empty data payload after the session key has been removed.",
      outcomes: [
        "200 OK - The selected session was revoked.",
        "400 Bad Request - The session ID was missing or invalid.",
        "401 Unauthorized - The user was not authenticated.",
        "404 Not Found - No active session matched the provided session ID.",
        "429 Too Many Requests - Session revocation was rate-limited.",
        "500 Internal Server Error - The service could not revoke the session.",
      ],
    }),
    logout: buildEndpointDoc({
      summary: "Logout Current Session",
      overview:
        "Ends the current authenticated session by clearing the refresh token state and removing the session cookies from the client.",
      requestBodyFields: [
        "None - The current session is identified from the refresh token cookie.",
      ],
      response:
        "Returns a success envelope with an empty data payload after the session cookies are cleared.",
      outcomes: [
        "200 OK - The current session was logged out successfully.",
        "400 Bad Request - The request could not be processed.",
        "401 Unauthorized - The session could not be authenticated.",
        "429 Too Many Requests - Logout was rate-limited.",
        "500 Internal Server Error - The service could not complete logout.",
      ],
    }),
    logoutAll: buildEndpointDoc({
      summary: "Logout All Sessions",
      overview:
        "Invalidates every active session for the authenticated user so all devices are signed out at once.",
      requestBodyFields: [
        "None - All sessions are derived from the authenticated user context.",
      ],
      response:
        "Returns a success envelope with an empty data payload after all session cookies are cleared.",
      outcomes: [
        "200 OK - All sessions were logged out successfully.",
        "400 Bad Request - The request could not be processed.",
        "401 Unauthorized - The user was not authenticated.",
        "429 Too Many Requests - Logout-all was rate-limited.",
        "500 Internal Server Error - The service could not revoke every session.",
      ],
    }),
    forgotPassword: buildEndpointDoc({
      summary: "Request Password Reset OTP",
      overview:
        "Starts the password reset flow by sending a reset OTP to the registered email address for the account.",
      requestBodyFields: [
        "`email` - Registered email address that should receive the reset OTP.",
      ],
      response:
        "Returns a reset session identifier that is used in the OTP verification step.",
      outcomes: [
        "200 OK - The reset OTP was sent and a reset session ID was created.",
        "400 Bad Request - The email field failed validation.",
        "404 Not Found - No user exists for the provided email address.",
        "429 Too Many Requests - Password reset requests were rate-limited.",
        "500 Internal Server Error - The service could not start the reset flow.",
      ],
    }),
    verifyResetOtp: buildEndpointDoc({
      summary: "Verify Password Reset OTP",
      overview:
        "Validates the reset OTP for the current reset session and issues a short-lived password reset token.",
      requestBodyFields: [
        "`sessionId` - Reset session identifier returned by the forgot-password step.",
        "`otp` - The 6-digit reset code sent to the user's email address.",
      ],
      response:
        "Returns a password reset token that must be supplied to the reset-password endpoint.",
      outcomes: [
        "200 OK - The reset OTP was verified successfully.",
        "400 Bad Request - The OTP was invalid or expired.",
        "429 Too Many Requests - OTP verification was rate-limited.",
        "500 Internal Server Error - The service could not complete OTP verification.",
      ],
    }),
    resetPassword: buildEndpointDoc({
      summary: "Reset Password",
      overview:
        "Completes the password reset flow by validating the password reset token and writing the new password to the account.",
      requestBodyFields: [
        "`passwordResetToken` - Short-lived reset token issued by the OTP verification step.",
        "`password` - New account password that must satisfy the password policy.",
        "`confirmPassword` - Confirmation value that must match the new password.",
      ],
      response:
        "Returns a success envelope with an empty data payload after the password is updated and existing session cookies are cleared.",
      outcomes: [
        "200 OK - The password was updated successfully.",
        "400 Bad Request - The token was invalid, expired, or the passwords did not match.",
        "429 Too Many Requests - Password reset was rate-limited.",
        "500 Internal Server Error - The service could not complete the password reset.",
      ],
    }),
  },
  userProfile: {
    getProfile: buildEndpointDoc({
      summary: "Get Current User Profile",
      overview:
        "Returns the profile information for the currently authenticated user.",
      requestBodyFields: [
        "None - The user is resolved from the active authentication context.",
      ],
      response:
        "Returns the user profile object with id, firstName, lastName, email, and createdAt.",
      outcomes: [
        "200 OK - The profile was retrieved successfully.",
        "400 Bad Request - The request could not be processed.",
        "401 Unauthorized - Authentication credentials were missing or invalid.",
        "404 Not Found - No profile exists for the authenticated user.",
        "429 Too Many Requests - Profile lookup was rate-limited.",
        "500 Internal Server Error - The service could not load the profile.",
      ],
    }),
    updateProfile: buildEndpointDoc({
      summary: "Update Current User Profile",
      overview:
        "Updates the authenticated user's profile fields using the current request schema.",
      requestBodyFields: [
        "`firstName` - Updated first name for the user profile.",
        "`lastName` - Updated last name for the user profile.",
      ],
      response:
        "Returns the updated user profile object after the stored record and cache have been synchronized.",
      outcomes: [
        "200 OK - The profile was updated successfully.",
        "400 Bad Request - The request body failed validation.",
        "401 Unauthorized - Authentication credentials were missing or invalid.",
        "429 Too Many Requests - Profile updates were rate-limited.",
        "500 Internal Server Error - The service could not update the profile.",
      ],
      notes: [
        "The current request schema requires both firstName and lastName.",
      ],
    }),
  },
} as const;

export const apiTitle = "User Service API";

export const apiVersion = "1.0.0";

export const apiDescription = `
# User Service API

The **User Service API** provides authentication, identity, and profile management for the IRCTC Railway Booking Platform. It enables secure user registration, login, session management, password recovery, and profile operations through a RESTful API.

## Core Capabilities

### Authentication

The authentication module supports the complete user lifecycle:

- **OTP Registration** — Register new users through email OTP verification.
- **Login & Logout** — Authenticate users and terminate the current session or all active sessions.
- **JWT Authentication** — Secure access using short-lived Access Tokens with Refresh Token rotation.
- **Token Refresh** — Obtain a new access token using a valid refresh token.
- **Session Management** — List active sessions and revoke individual sessions by ID.
- **Password Reset** — Reset passwords through a secure email OTP verification flow.

### User Profile

Authenticated users can manage their own account information using:

- \`GET /api/v1/users/me\` — Retrieve the authenticated user's profile.
- \`PUT /api/v1/users/me\` — Update the authenticated user's profile.

`;
