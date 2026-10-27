/**
 * Authentication API endpoints.
 *
 * Thin wrappers around `apiFetch` for the two authentication-related
 * backend routes:
 *   - POST /auth/register  -> create a new driver or admin account
 *   - POST /auth/login     -> exchange credentials for a JWT + user record
 *   - PATCH /auth/me       -> update the authenticated user's profile
 *
 * The wrappers are deliberately tiny: they only describe the contract.
 * All HTTP concerns (URL composition, JSON encoding, Bearer token
 * injection, error translation) live in `api.ts`.
 */

import { API_ENDPOINTS } from "../lib/constants";
import type {
  AuthResponse,
  LoginCredentials,
  ProfileUpdatePayload,
  RegisterPayload,
  User,
} from "../types/auth";
import { apiSendJson } from "./api";

/**
 * Register a brand-new user account.
 *
 * Returns the JWT + user record on success so callers can immediately
 * persist the session via `setSession()` from the auth store.
 *
 * Throws `ApiError` on validation failure (400) or duplicate email (409).
 */
export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return apiSendJson<AuthResponse>(API_ENDPOINTS.AUTH_REGISTER, "POST", payload);
}

/**
 * Authenticate with email + password.
 *
 * Returns the JWT + user record on success. Throws `ApiError` with
 * status 401 when the credentials are invalid.
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  return apiSendJson<AuthResponse>(API_ENDPOINTS.AUTH_LOGIN, "POST", credentials);
}

/**
 * Update the authenticated user's own profile (name today; email/role
 * can be added later without changing the call site).
 *
 * Returns the refreshed `User` record so callers can persist it to
 * the auth store with a single round-trip. Throws `ApiError` with
 * status 401 if the token has expired — the caller should treat that
 * as a forced sign-out.
 */
export async function updateProfile(
  payload: ProfileUpdatePayload,
): Promise<User> {
  return apiSendJson<User>(API_ENDPOINTS.AUTH_ME, "PATCH", payload);
}
