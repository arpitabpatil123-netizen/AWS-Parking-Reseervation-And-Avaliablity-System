/**
 * Page-specific helpers for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous inline implementations
 * in `my-reservations.astro`:
 *
 *   - `escapeHtml`        — identical regex chain to the inline copy
 *                           (also exists in `lib/format.ts` but with a
 *                           different signature: that one accepts null
 *                           and returns `""` for nullish, which would
 *                           silently change XSS protection semantics
 *                           for reservation fields that may legitimately
 *                           be empty. Kept local to preserve behavior.)
 *
 *   - `relativeTime`      — uses `Math.round` (not `Math.floor` like
 *                           `lib/format.ts#formatRelativeTime`) and
 *                           treats `< 45s` as "just now" with no
 *                           absolute fallback. Behaviorally distinct
 *                           from the shared helper — preserved as-is.
 *
 *   - `formatReservationDate`
 *                         — `8-Aug-2026 15:38` format identical to
 *                           `lib/format.ts#formatDateTime` but returns
 *                           the raw ISO string as fallback (not `—`).
 *                           Preserved as-is.
 */

import { INDIA_LOCALE, INDIA_TIME_ZONE } from "../../lib/constants";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12)
    return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
  const diffYear = Math.round(diffMonth / 12);
  return `${diffYear} year${diffYear === 1 ? "" : "s"} ago`;
}

/**
 * Format an ISO timestamp in Indian date order and Asia/Kolkata time.
 *
 * Returns the raw ISO string as a graceful fallback when the input is
 * not a valid Date so we never display "Invalid Date".
 */
export function formatReservationDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(INDIA_LOCALE, {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}