import { buildEndpointDoc } from "@irctc/openapi";

export const adminServiceOpenApiDescriptions = {
  auth: {
    login: buildEndpointDoc({
      summary: "Admin Login",
      // i should change the overview i dont send the accesstoken in response
      overview:
        "Authenticates an administrator using email and password. On success, and the JWT access_token (7-day expiry) is set as an HTTP-only cookie scoped to the admin auth path.",
      requestBodyFields: [
        "`email` - The administrator's email address.",
        "`password` - Administrator password validated against the password policy.",
      ],
      response:
        "Returns the authenticated admin profile in the success envelope's `data` field.",
      outcomes: [
        "200 OK - Credentials are valid and the admin is authenticated.",
        "400 Bad Request - The request body failed schema validation.",
        "401 Unauthorized - The email is unknown or the password does not match.",
        "429 Too Many Requests - Login attempts were rate-limited.",
        "500 Internal Server Error - The service could not complete authentication.",
      ],
      notes: [
        "Admin accounts are seeded at database setup time. There is no public admin signup flow.",
        "All subsequent admin-only endpoints require the access token returned by this endpoint.",
      ],
    }),
    logout: buildEndpointDoc({
      summary: "Admin Logout",
      overview:
        "Clears the admin-side access token cookie for the current session. The endpoint is idempotent and does not require a request body.",
      response:
        "Returns a success envelope with an empty data payload after the admin access token cookie has been cleared.",
      outcomes: [
        "200 OK - The admin session cookie was cleared.",
        "401 Unauthorized - The admin access token cookie is missing, invalid, or has already expired.",
        "500 Internal Server Error - The service could not complete logout.",
      ],
      notes: [
        "The endpoint expects the admin access token cookie to be present. Clients should send credentials with the request.",
      ],
    }),
  },
};

export const apiTitle = "Admin Service API";
export const apiVersion = "1.0.0";
export const apiDescription = `
  # Admin Service API

  The **Admin Service API** exposes administrator-only authentication and
  administrative operations for the IRCTC Railway Booking Platform. It is
  intended for internal staff and platform-admin tooling — it is not exposed
  to end users.

  ## Core Capabilities

  ### Authentication

  - **Admin Login** — Authenticate an administrator using email and password.
  - **Admin Logout** — Clear the admin access token cookie.

`;
