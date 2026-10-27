/**
 * Centralized constants for SpotSync.
 *
 * This module collects genuinely-repeated, configuration-like, and
 * domain-specific values into one place so that:
 *
 *   - Storage keys stay in sync between the API client and the auth store.
 *   - Route paths referenced from client-side scripts and `href` attributes
 *     use the same source of truth.
 *   - Zone types, reservation statuses, and capacity thresholds have a
 *     single immutable declaration that downstream helpers can import.
 *   - Status/role badges (color tokens, display labels) live next to the
 *     enum they belong to, so renaming a status updates the UI in one pass.
 *
 * Guidelines (per Step 10.1):
 *   - Only extract values that are genuinely repeated, configuration-like,
 *     or meaningful magic values.
 *   - Do NOT move every string or number into constants; HTML attribute
 *     names, CSS values, and obviously local values stay where they are.
 *   - All exported structures use `as const` so consumers can rely on the
 *     literal types (`"driver" | "admin"`, etc.) without re-declaring them.
 */

/* -------------------------------------------------------------------------- */
/* Storage keys                                                               */
/* -------------------------------------------------------------------------- */

export const INDIA_LOCALE = "en-IN";
export const INDIA_TIME_ZONE = "Asia/Kolkata";
export const INDIA_CURRENCY = "INR";

/**
 * localStorage keys for the persistent auth state. Kept in sync with
 * `services/api.ts` (which reads the token) and `store/authStore.ts`
 * (which writes both keys). Centralizing them prevents the auth store
 * and the fetch wrapper from drifting apart.
 */
export const STORAGE_KEYS = {
  TOKEN: "spotsync_token",
  USER: "spotsync_user",
} as const;

/* -------------------------------------------------------------------------- */
/* Route paths                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Frontend route paths used by navigation links, redirects, and
 * `window.location.href` assignments. Centralized so a rename here
 * propagates to every navigation site.
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  MY_RESERVATIONS: "/my-reservations",
  ADMIN: "/admin",
} as const;

/* -------------------------------------------------------------------------- */
/* Zone types                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The three zone-type discriminators that the Go backend and the
 * frontend both understand. Re-exported as a `const` object so consumers
 * can iterate (`Object.values(ZONE_TYPES)`) and reference
 * (`ZONE_TYPES.EV_CHARGING`) without redeclaring the literal union.
 */
export const ZONE_TYPES = {
  GENERAL: "general",
  EV_CHARGING: "ev_charging",
  COVERED: "covered",
} as const;

/** Human-readable labels for zone types, used by ZoneCard, ReservationCard, etc. */
export const ZONE_TYPE_LABELS: Record<(typeof ZONE_TYPES)[keyof typeof ZONE_TYPES], string> = {
  general: "General",
  ev_charging: "EV Charging",
  covered: "Covered",
};

/* -------------------------------------------------------------------------- */
/* Reservation statuses                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Reservation lifecycle states. Mirrors `ReservationStatus` in
 * `src/types/reservation.ts` but is exported as a `const` map so we
 * can iterate and reference keys without re-listing the values.
 */
export const RESERVATION_STATUS = {
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

/** Display labels for reservation statuses. */
export const RESERVATION_STATUS_LABELS: Record<
  (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS],
  string
> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

/* -------------------------------------------------------------------------- */
/* Capacity thresholds                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Thresholds (in percent) that drive the ZoneCard capacity bar:
 *   - `< LOW`            -> "Full" + red
 *   - `[LOW, MEDIUM)`    -> "Almost Full" + red
 *   - `[MEDIUM, 100]`    -> "Filling Up" + amber
 *   - `100`              -> "Open" + green
 *
 * Centralizing these keeps the ZoneCard's color/label rules in sync with
 * any future client-side filter (e.g. "show me only zones that aren't
 * almost full").
 */
export const CAPACITY_THRESHOLDS = {
  /** Below this percent, the zone is "Almost Full" / red. */
  LOW: 20,
  /** At or above LOW but below this percent, the zone is "Filling Up" / amber. */
  MEDIUM: 50,
} as const;

/* -------------------------------------------------------------------------- */
/* API endpoints                                                              */
/* -------------------------------------------------------------------------- */

/**
 * REST endpoint paths appended to the API base URL. These mirror the
 * routes wired up in `backend/internal/api/...` and are referenced by
 * the service layer. Centralizing them makes endpoint renames a one-line
 * change and helps us see the full API surface at a glance.
 */
export const API_ENDPOINTS = {
  AUTH_LOGIN: "/auth/login",
  AUTH_REGISTER: "/auth/register",
  AUTH_ME: "/auth/me",
  AUTH_USERS: "/auth/users",
  AUTH_USERS_COUNT: "/auth/users/count",
  AUTH_USER_BY_ID: (id: number): string => `/auth/users/${id}`,
  ZONES: "/zones",
  ZONE_BY_ID: (id: number): string => `/zones/${id}`,
  RESERVATIONS: "/reservations",
  RESERVATIONS_MINE: "/reservations/mine",
  RESERVATION_STATUS: (id: number): string => `/reservations/${id}/status`,
  RESERVATION_BY_ID: (id: number): string => `/reservations/${id}`,
} as const;

/* -------------------------------------------------------------------------- */
/* Status / role badge styling                                                */
/* -------------------------------------------------------------------------- */

/**
 * Tailwind class strings for the reservation-status pills rendered by
 * `ReservationCard.astro` and `AdminStatusBadge.astro`. The two badges
 * intentionally use different palettes (card uses the glassmorphism
 * emerald/blue/slate chips, the admin badge uses HSL arbitrary values),
 * so we expose both styles keyed by the same status.
 */

/** Glassmorphism pill classes used by `ReservationCard.astro`. */
export const RESERVATION_STATUS_BADGE: Record<
  (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS],
  {
    pillClasses: string;
    dotClasses: string;
    stripeGradient: string;
    stripeGlow: string;
  }
> = {
  active: {
    pillClasses:
      "bg-emerald-500/15 text-emerald-200 border-emerald-400/40 ring-1 ring-emerald-400/20",
    dotClasses: "bg-emerald-400 shadow-emerald-400/70",
    stripeGradient: "from-emerald-500 via-emerald-400 to-emerald-600",
    stripeGlow: "shadow-emerald-500/50",
  },
  completed: {
    pillClasses:
      "bg-blue-500/15 text-blue-200 border-blue-400/30 ring-1 ring-blue-400/10",
    dotClasses: "bg-blue-400 shadow-blue-400/60",
    stripeGradient: "from-blue-500 via-blue-400 to-blue-600",
    stripeGlow: "shadow-blue-500/40",
  },
  cancelled: {
    pillClasses:
      "bg-slate-700/40 text-slate-300 border-slate-500/40 ring-1 ring-slate-500/10",
    dotClasses: "bg-slate-400 shadow-slate-400/40",
    stripeGradient: "from-slate-600 via-slate-500 to-slate-700",
    stripeGlow: "shadow-slate-500/30",
  },
};

/**
 * Tailwind classes for the zone-type badge rendered by `ZoneCard.astro`,
 * `ReservationCard.astro`, and the home page. Keyed by zone type.
 */
export const ZONE_TYPE_BADGE: Record<
  (typeof ZONE_TYPES)[keyof typeof ZONE_TYPES],
  string
> = {
  ev_charging: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  general: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  covered: "bg-purple-500/10 text-purple-300 border-purple-500/30",
};

/** Stronger glassmorphism variant used by `ReservationCard.astro` for the zone chip. */
export const ZONE_TYPE_CHIP: Record<
  (typeof ZONE_TYPES)[keyof typeof ZONE_TYPES],
  string
> = {
  ev_charging: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  general: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  covered: "bg-purple-500/15 text-purple-300 border-purple-400/30",
};

/** Lucide-style icon name for each zone type — drives the `TYPE_BADGES` rendering in ZoneCard. */
export const ZONE_TYPE_ICONS: Record<
  (typeof ZONE_TYPES)[keyof typeof ZONE_TYPES],
  "zap" | "car" | "shield"
> = {
  ev_charging: "zap",
  general: "car",
  covered: "shield",
};

/* -------------------------------------------------------------------------- */
/* User roles                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Re-export of the two user roles as a `const` object for parity with
 * `ZONE_TYPES` and `RESERVATION_STATUS`. Consumers that need a literal
 * union can `import type { UserRole } from "../types/auth"`.
 */
export const USER_ROLES = {
  DRIVER: "driver",
  ADMIN: "admin",
} as const;

/** Display labels for user roles. */
export const USER_ROLE_LABELS: Record<
  (typeof USER_ROLES)[keyof typeof USER_ROLES],
  string
> = {
  driver: "Driver",
  admin: "Admin",
};

/* -------------------------------------------------------------------------- */
/* Configuration defaults                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Demo account credentials surfaced by the quick-fill buttons on the
 * login page. Centralized so the demo seed values stay in sync between
 * the login button (`DemoFill.astro`) and any documentation/README.
 */
export const DEMO_ACCOUNTS = {
  DRIVER: {
    email: "john@spotsync.com",
    password: "password123",
  },
  ADMIN: {
    email: "admin@spotsync.com",
    password: "adminpassword",
  },
} as const;

/**
 * Localhost fallback for the API base URL. The actual value is loaded
 * from `import.meta.env.PUBLIC_API_BASE_URL` at build time; this is
 * only used when that variable is absent (e.g. local dev without a
 * configured `.env`). Kept here so the fallback isn't a magic string
 * buried in `services/api.ts`.
 */
export const DEFAULT_API_BASE_URL = "http://localhost:8080/api/v1";