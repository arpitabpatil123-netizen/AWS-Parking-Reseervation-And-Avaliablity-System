/**
 * Domain type contracts for authentication.
 *
 * These interfaces mirror the Go backend DTOs so that the fetch layer
 * (src/services/api.ts) can pass strongly-typed payloads from end to end.
 */

/** Role discriminator for the two first-class user personas in SpotSync. */
export type UserRole = "driver" | "admin";

/**
 * Authenticated user record returned by /auth/login and /auth/register.
 *
 * NOTE: the Go backend serializes the user-display field as `name`
 * (`json:"name"` in `backend/internal/dto/auth_dto.go`). We mirror that
 * exact key on the frontend so the API envelopes deserialize cleanly.
 */
export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at?: string;
}

/** Credentials captured on the login page. */
export interface LoginCredentials {
  email: string;
  password: string;
}

/** Credentials captured on the registration page (role is selected client-side). */
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/**
 * Auth response envelope returned by both /auth/login and /auth/register.
 * The token is a JWT Bearer token that the apiFetch wrapper attaches to
 * every subsequent request.
 */
export interface AuthResponse {
  token: string;
  user: User;
}

/**
 * Patch payload accepted by `PATCH /auth/me`. Only the editable
 * profile fields live here — email/role changes are intentionally
 * out of scope for the self-service settings modal.
 */
export interface ProfileUpdatePayload {
  name: string;
}
