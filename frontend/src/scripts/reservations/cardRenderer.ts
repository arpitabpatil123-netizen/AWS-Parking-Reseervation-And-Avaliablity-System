/**
 * Client-side reservation card renderer for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous inline `renderCard`
 * function in `my-reservations.astro`.
 *
 * IMPORTANT: this is a manual re-implementation of the SSR markup
 * produced by `ReservationCard.astro`. It MUST stay byte-for-byte
 * equivalent to that component so a fresh client render (after a
 * filter/search/cancel) produces the same UI as the initial
 * server-rendered card. Changing this string would change behavior.
 */

import {
  RESERVATION_STATUS,
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABELS,
  ZONE_TYPES,
  ZONE_TYPE_CHIP,
  ZONE_TYPE_LABELS,
} from "../../lib/constants";
import type { Reservation, ReservationStatus } from "../../types/reservation";
import type { ParkingZone, ZoneType } from "../../types/zone";
import { escapeHtml, formatReservationDate, relativeTime } from "./helpers";

const TYPE_LABELS: Record<ZoneType, string> = ZONE_TYPE_LABELS;

// Inline SVG icons — kept here because each is large and self-contained,
// not because the *names* of the zones are duplicated elsewhere.
const TYPE_ICONS: Record<ZoneType, string> = {
  ev_charging: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
  general: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>`,
  covered: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>`,
};

const STATUS_CONFIG: Record<
  ReservationStatus,
  {
    label: string;
    pillClasses: string;
    dotClasses: string;
    stripeGradient: string;
    stripeGlow: string;
  }
> = {
  [RESERVATION_STATUS.ACTIVE]: {
    label: RESERVATION_STATUS_LABELS.active,
    ...RESERVATION_STATUS_BADGE.active,
  },
  [RESERVATION_STATUS.COMPLETED]: {
    label: RESERVATION_STATUS_LABELS.completed,
    ...RESERVATION_STATUS_BADGE.completed,
  },
  [RESERVATION_STATUS.CANCELLED]: {
    label: RESERVATION_STATUS_LABELS.cancelled,
    ...RESERVATION_STATUS_BADGE.cancelled,
  },
};

const TYPE_CHIP: Record<ZoneType, string> = ZONE_TYPE_CHIP;

export function renderCard(reservation: Reservation): string {
  const zone: ParkingZone | undefined = reservation.zone;
  const zoneName = zone?.name ?? `Zone #${reservation.zone_id}`;
  const zoneType: ZoneType = zone?.type ?? ZONE_TYPES.GENERAL;
  const typeLabel = TYPE_LABELS[zoneType];
  const plate = (reservation.license_plate ?? "").trim() || "—";
  const status = reservation.status;
  const isActive = status === RESERVATION_STATUS.ACTIVE;
  const badge = STATUS_CONFIG[status] ?? STATUS_CONFIG[RESERVATION_STATUS.CANCELLED];
  const typeIconBg = TYPE_CHIP[zoneType];
  const icon = TYPE_ICONS[zoneType];

  const cancelButton = isActive
    ? `
        <button
          type="button"
          data-cancel-reservation
          data-reservation-id="${reservation.id}"
          data-zone-name="${escapeHtml(zoneName)}"
          data-license-plate="${escapeHtml(plate)}"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 hover:border-red-500/60 transition-all shadow-sm hover:shadow-red-500/20"
          aria-label="Cancel reservation #${reservation.id}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          Cancel Spot
        </button>
      `
    : `
        <span class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 bg-slate-800/40 border border-slate-700/40">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Locked
        </span>
      `;

  const formattedDate = formatReservationDate(reservation.created_at);
  const relative = relativeTime(reservation.created_at);

  return `
      <article
        class="group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 backdrop-blur-md shadow-xl shadow-black/20 transition-all duration-300 hover:border-slate-700 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/40 animate-fade-in-up"
        data-reservation-card
        data-reservation-id="${reservation.id}"
        data-reservation-status="${status}"
      >
        <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b shadow-lg ${badge.stripeGradient} ${badge.stripeGlow}" aria-hidden="true"></div>

        <header class="flex items-start justify-between gap-3 px-5 pt-5">
          <div class="flex items-center gap-3 min-w-0">
            <span class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 text-slate-100 font-mono text-sm font-bold shadow-inner">
              #${reservation.id}
            </span>
            <div class="min-w-0">
              <p class="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500 font-bold">Reservation #${reservation.id}</p>
              <p class="text-sm font-semibold text-slate-100 font-mono tracking-tight" title="${escapeHtml(reservation.created_at)}" data-formatted-date="${escapeHtml(reservation.created_at)}">
                ${escapeHtml(formattedDate)}
              </p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${badge.pillClasses}">
            <span class="relative w-1.5 h-1.5 rounded-full shadow-sm ${badge.dotClasses}" aria-hidden="true">
              ${isActive ? `<span class="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></span>` : ""}
            </span>
            ${badge.label}
          </span>
        </header>

        <div class="px-5 pt-4">
          <div class="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-900/40 border border-slate-800/80">
            <span class="inline-flex items-center justify-center w-11 h-11 rounded-xl border shrink-0 ${typeIconBg}" aria-hidden="true">
              ${icon}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-50 truncate">${escapeHtml(zoneName)}</p>
              <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(typeLabel)} • Zone #${reservation.zone_id}</p>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 px-5 pt-4 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500 font-bold">Plate</span>
            <span class="inline-flex items-center px-3 py-1.5 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 text-slate-100 font-mono text-sm font-bold tracking-[0.15em] shadow-inner ring-1 ring-inset ring-white/5">
              ${escapeHtml(plate)}
            </span>
          </div>
          <p class="text-xs text-slate-400 inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-slate-500" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span data-relative-time="${escapeHtml(reservation.created_at)}">${escapeHtml(relative)}</span>
          </p>
        </div>

        <footer class="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-slate-800/80 bg-slate-950/40">
          ${cancelButton}
        </footer>
      </article>
    `;
}