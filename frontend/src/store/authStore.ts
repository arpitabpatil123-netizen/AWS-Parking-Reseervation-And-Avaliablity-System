/**
 * Client-side authentication state powered by Nano Stores.
 *
 * Why Nano Stores?
 *   - Tiny (<1 KB) and framework-agnostic, which matches Astro's
 *     "islands" hydration model perfectly.
 *   - `@nanostores/persistent` keeps state in localStorage automatically,
 *     so a refresh doesn't kick the user back to the login page.
 *
 * What lives here?
 *   - `$token`   : persistent JWT Bearer token (string | null)
 *   - `$user`    : persistent authenticated user record (User | null)
 *   - `$isAuth`  : computed boolean derived from `$token`
 *   - `$isAdmin` : computed boolean derived from `$user.role`
 *
 * The token is also mirrored to `localStorage` under the same key that
 * `services/api.ts` reads from, so the fetch wrapper picks it up on
 * the very next request without any extra wiring.
 */

import { persistentAtom } from "@nanostores/persistent";
import { computed, type ReadableAtom } from "nanostores";

import { STORAGE_KEYS } from "../lib/constants";
import { TOKEN_STORAGE_KEY } from "../services/api";
import type { User } from "../types/auth";

/* -------------------------------------------------------------------------- */
/* Persistent atoms                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Persistent JWT token. Stored under the localStorage key that the
 * fetch wrapper (`services/api.ts`) already looks at, so a successful
 * login automatically authorizes subsequent requests.
 *
 * Why an explicit encoder? `persistentAtom`'s no-encoder overload only
 * accepts `string | undefined` values. We need `string | null` to
 * represent "signed out", so we use the encoder-based overload: encode
 * `null` as the empty string (the conventional "absent" sentinel) and
 * decode the empty string back to `null` on boot.
 */
export const $token = persistentAtom<string | null>(
  TOKEN_STORAGE_KEY,
  null,
  {
    encode: (value) => (value ?? ""),
    decode: (raw) => (raw.length > 0 ? raw : null),
  },
);

/**
 * Persistent user record. We serialize via JSON so role/email/id
 * survive a full page reload. The decoder swallows parse failures and
 * returns `null` so a corrupt entry never crashes the app on boot.
 */
export const $user = persistentAtom<User | null>(
  STORAGE_KEYS.USER,
  null,
  {
    encode: JSON.stringify,
    decode: (raw) => {
      if (raw === null || raw === undefined || raw === "") {
        return null;
      }
      try {
        return JSON.parse(raw) as User;
      } catch {
        return null;
      }
    },
  },
);

/* -------------------------------------------------------------------------- */
/* Computed (derived) atoms                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `true` whenever a token is present. Components can subscribe to this
 * to reactively show/hide auth-only UI without polling localStorage.
 */
export const $isAuthenticated: ReadableAtom<boolean> = computed(
  $token,
  (token) => token !== null && token.length > 0,
);

/**
 * `true` only when the persisted user has the `admin` role.
 * Used by the admin guard in `/admin` and by the navbar to decide
 * whether to render the admin dashboard link.
 */
export const $isAdmin: ReadableAtom<boolean> = computed(
  $user,
  (user) => user?.role === "admin",
);

/* -------------------------------------------------------------------------- */
/* Imperative helpers                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Persist a fresh authentication session.
 *
 * Writes to BOTH the persistent atoms (drives reactivity) AND
 * `localStorage` directly (so the fetch wrapper's synchronous
 * `getAuthToken()` sees the new token on the very next request,
 * without waiting for a microtask to flush).
 */
export function setSession(token: string, user: User): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
  $token.set(token);
  $user.set(user);
}

/**
 * Replace the persisted user record in-place without touching the
 * JWT. Used by the profile settings modal after a successful
 * `PATCH /auth/me` — keeps the token valid, refreshes the cached
 * user (new name, new updated_at, etc.), and triggers every
 * subscriber of `$user` so the navbar avatar re-renders.
 */
export function updateUser(user: User): void {
  $user.set(user);
}

/**
 * Wipe every trace of the current session from memory and storage.
 * Called on logout and on 401 responses from the API.
 */
export function clearSession(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEYS.USER);
  }
  $token.set(null);
  $user.set(null);
}

/**
 * Imperative auth check. Mirrors `$isAuthenticated.get()` but is more
 * ergonomic for one-off checks inside event handlers / scripts.
 */
export function isAuthenticated(): boolean {
  const token = $token.get();
  return token !== null && token.length > 0;
}

/**
 * Imperative role check. Returns `false` when the user is signed out
 * or whose persisted role is anything other than `'admin'`.
 */
export function isAdmin(): boolean {
  return $user.get()?.role === "admin";
}

/**
 * Read the current token synchronously. Useful when you need to send
 * the raw JWT to a third-party widget (e.g. a WebSocket handshake) that
 * doesn't go through `apiFetch`.
 */
export function getToken(): string | null {
  return $token.get();
}

/**
 * Read the current user record synchronously, or `null` if signed out.
 */
export function getUser(): User | null {
  return $user.get();
}
