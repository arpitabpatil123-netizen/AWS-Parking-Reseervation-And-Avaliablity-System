import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { INDIA_CURRENCY, INDIA_LOCALE } from "./constants";

/**
 * Shadcn-style classnames helper.
 *
 * Combines `clsx` (conditional classes) with `tailwind-merge` (resolves
 * conflicting Tailwind utilities so the LAST one wins). Used by every
 * UI primitive in `src/components/ui/`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/* Currency formatting                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Format a numeric INR price as `₹5.50/hr`.
 *
 * Renders exactly two decimal places and appends `/hr`. Behaviour
 * Uses Indian number grouping and keeps two decimal places for paise.
 */
const hourlyPriceFormatter = new Intl.NumberFormat(INDIA_LOCALE, {
  style: "currency",
  currency: INDIA_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPricePerHour(value: number): string {
  return `${hourlyPriceFormatter.format(value)}/hr`;
}

/* -------------------------------------------------------------------------- */
/* Capacity calculations                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Compute the fill percentage of a parking zone as a number in `[0, 100]`.
 *
 * Behaviour:
 *   - Negative `total` is coerced to 0 (defensive — backend always
 *     sends non-negative integers, but TypeScript can't enforce that).
 *   - When `total` is 0 the function returns 0 (avoids `NaN`).
 *   - When `available` exceeds `total` (corrupt payload), the result is
 *     capped at 100 so the progress bar never overflows.
 *
 * Used by `ZoneCard.astro` (full-fraction) and `OverviewDashboard.tsx`
 * (occupied-fraction — see `capacityOccupancyPercent` below).
 */
export function capacityFillPercent(
  total: number,
  available: number,
): number {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 0;
  const safeAvailable = Math.max(0, Math.min(available, safeTotal));
  return Math.min(100, (safeAvailable / safeTotal) * 100);
}

/**
 * Compute the OCCUPIED percentage of a parking zone as a number in `[0, 100]`.
 *
 * This is the complement of `capacityFillPercent` — used by the admin
 * "Top Zones" leaderboard (`OverviewDashboard.tsx`) which ranks zones by
 * occupancy rather than availability.
 */
export function capacityOccupancyPercent(
  total: number,
  available: number,
): number {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 0;
  const used = Math.max(0, safeTotal - Math.max(0, available));
  return Math.min(100, Math.round((used / safeTotal) * 100));
}

/* -------------------------------------------------------------------------- */
/* Reservation status helpers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Type guard that returns true when the given status corresponds to a
 * booking the driver can still cancel (`active`). Centralized so the
 * Cancel button visibility check stays consistent across cards, tables,
 * and dashboards.
 */
export function isActiveReservationStatus(
  status: string | null | undefined,
): boolean {
  return status === "active";
}