/**
 * Reservation list painter for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous inline `renderKpis`,
 * `matchesFilter`, `matchesSearch`, `paintGrid`, and `paintAll`
 * functions in `my-reservations.astro`.
 *
 * All selectors (`[data-kpi-*]`, `[data-reservation-grid]`,
 * `[data-filter-empty]`, `[data-empty-state]`) match the markup
 * rendered by `ReservationStates.astro` / `ReservationKpiStrip.astro`.
 */

import { RESERVATION_STATUS } from "../../lib/constants";
import type { Reservation } from "../../types/reservation";
import { showSection } from "./auth";
import { renderCard } from "./cardRenderer";
import { state, type FilterValue } from "./state";

function renderKpis(): void {
  const all = state.allReservations;
  const total = all.length;
  const active = all.filter((r) => r.status === RESERVATION_STATUS.ACTIVE).length;
  const cancelled = all.filter(
    (r) => r.status === RESERVATION_STATUS.CANCELLED || r.status === RESERVATION_STATUS.COMPLETED,
  ).length;

  const latest = [...all].sort((a, b) => {
    const aMs = new Date(a.created_at).getTime();
    const bMs = new Date(b.created_at).getTime();
    return bMs - aMs;
  })[0];
  const latestLabel = latest
    ? `#${latest.id}`
    : all.length === 0
    ? "—"
    : "—";

  const totalEl = document.querySelector<HTMLElement>("[data-kpi-total]");
  const activeEl = document.querySelector<HTMLElement>("[data-kpi-active]");
  const cancelledEl =
    document.querySelector<HTMLElement>("[data-kpi-cancelled]");
  const latestEl = document.querySelector<HTMLElement>("[data-kpi-latest]");

  if (totalEl) totalEl.textContent = String(total);
  if (activeEl) activeEl.textContent = String(active);
  if (cancelledEl) cancelledEl.textContent = String(cancelled);
  if (latestEl) latestEl.textContent = latestLabel;
}

function matchesFilter(reservation: Reservation, filter: FilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "active") return reservation.status === RESERVATION_STATUS.ACTIVE;
  if (filter === "cancelled") {
    return reservation.status === RESERVATION_STATUS.CANCELLED || reservation.status === RESERVATION_STATUS.COMPLETED;
  }
  return true;
}

function matchesSearch(reservation: Reservation, query: string): boolean {
  if (!query) return true;
  const haystack = reservation.license_plate.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function paintGrid(): void {
  const grid = document.querySelector<HTMLElement>("[data-reservation-grid]");
  if (!grid) return;

  if (state.allReservations.length === 0) {
    showSection("empty");
    return;
  }

  const filtered = state.allReservations.filter(
    (r) => matchesFilter(r, state.currentFilter) && matchesSearch(r, state.currentSearch),
  );

  if (filtered.length === 0) {
    showSection("filter-empty");
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const aMs = new Date(a.created_at).getTime();
    const bMs = new Date(b.created_at).getTime();
    return bMs - aMs;
  });

  grid.innerHTML = sorted.map(renderCard).join("");
  showSection("grid");
}

export function paintAll(): void {
  renderKpis();
  paintGrid();
}