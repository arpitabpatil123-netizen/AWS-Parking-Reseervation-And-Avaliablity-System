/**
 * Catalog refresh + re-render for the user dashboard.
 *
 * Keeps:
 *   - The All Zones grid ([data-zone-grid])
 *   - The Emergency Zones section ([data-emergency-grid])
 *   - The 3-metric Summary section ([data-summary="..."])
 *   - The Navigation tab counters ([data-nav-count="..."])
 * in sync with fresh data fetched from the API.
 */

import {
  CAPACITY_THRESHOLDS,
  ZONE_TYPE_BADGE,
  ZONE_TYPE_LABELS,
} from "../../lib/constants";
import {
  capacityFillPercent,
  formatPricePerHour,
  getZoneLocation,
} from "../../lib/utils";
import type { ParkingZone } from "../../types/zone";
import { escapeHtml } from "./escapeHtml";
import { refetchFromActiveSource } from "./dataSource";
import { reapplyFilters } from "./filterController";
import { toast } from "../../lib/toast";

const TYPE_LABEL: Record<ParkingZone["type"], string> = ZONE_TYPE_LABELS;
const TYPE_BADGE: Record<ParkingZone["type"], string> = ZONE_TYPE_BADGE;

/**
 * Replace the zone grid, emergency section, and stats with a fresh server fetch.
 */
export async function refetchZones(): Promise<void> {
  try {
    const fresh = await refetchFromActiveSource();
    renderZones(fresh);
    renderEmergencyZones(fresh);
    renderStats(fresh);
    reapplyFilters();
  } catch (error) {
    // Soft-fail: keep existing UI, alert user
    toast.error("Could not refresh parking data. Please reload the page.");
    console.error("refetchZones failed:", error);
  }
}

function sortZonesForDisplay(zones: ParkingZone[]): ParkingZone[] {
  return [...zones].sort((a, b) => {
    const aClosed = a.emergency_closed ? 2 : (a.available_spots ?? 0) <= 0 ? 1 : 0;
    const bClosed = b.emergency_closed ? 2 : (b.available_spots ?? 0) <= 0 ? 1 : 0;
    return aClosed - bClosed;
  });
}

/**
 * Re-render the All Zones grid with new data.
 */
export function renderZones(zones: ParkingZone[]): void {
  const grid = document.querySelector<HTMLDivElement>("[data-zone-grid]");
  if (!grid) return;
  grid.innerHTML = sortZonesForDisplay(zones)
    .map((zone) => cardHtml(zone))
    .join("");

  // Re-bind reserve triggers for newly created cards
  void import("./reserveModalController").then((m) => m.bindReserveTriggersOnce());
  bindEmergencyBlockedButtons();
}

/**
 * Re-render the Emergency Zones section.
 */
export function renderEmergencyZones(zones: ParkingZone[]): void {
  const emergencyGrid = document.querySelector<HTMLDivElement>("[data-emergency-grid]");
  const emptyState = document.querySelector<HTMLElement>("[data-emergency-empty-state]");
  const counterEl = document.querySelector<HTMLElement>("[data-emergency-counter]");

  const emergencyZones = zones.filter(
    (z) =>
      z.emergency_closed === true ||
      z.emergency_status === "Emergency Active" ||
      z.emergency_status === "Temporarily Unavailable" ||
      z.emergency_status === "Blocked"
  );

  if (counterEl) {
    counterEl.textContent = `${emergencyZones.length} Active`;
  }

  if (emptyState) {
    emptyState.classList.toggle("hidden", emergencyZones.length > 0);
  }

  if (emergencyGrid) {
    emergencyGrid.classList.toggle("hidden", emergencyZones.length === 0);
    emergencyGrid.innerHTML = emergencyZones
      .map((zone) => emergencyCardHtml(zone))
      .join("");
  }

  bindEmergencyBlockedButtons();
}

/**
 * Recompute the small summary cards and navigation tab counts.
 */
export function renderStats(zones: ParkingZone[]): void {
  const totalCapacity = zones.reduce((s, z) => s + (z.total_capacity ?? 0), 0);
  const totalAvailable = zones.reduce((s, z) => s + (z.emergency_closed ? 0 : (z.available_spots ?? 0)), 0);
  const totalOccupied = zones.reduce((s, z) => {
    if (Array.isArray(z.spot_holds)) {
      return s + z.spot_holds.filter((h) => h === 1).length;
    }
    return s + (z.emergency_closed ? 0 : Math.max(0, (z.total_capacity ?? 0) - (z.available_spots ?? 0)));
  }, 0);
  const emergencyZones = zones.filter((z) => z.emergency_closed === true);
  const emergencyCount = emergencyZones.length;

  const availPercent = totalCapacity > 0 ? Math.round((totalAvailable / totalCapacity) * 100) : 0;
  const occPercent = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  // 1. Summary Cards
  const availEl = document.querySelector<HTMLElement>('[data-summary="availableSpaces"]');
  const availPctEl = document.querySelector<HTMLElement>('[data-summary="availablePercent"]');
  const occEl = document.querySelector<HTMLElement>('[data-summary="occupiedSpaces"]');
  const occPctEl = document.querySelector<HTMLElement>('[data-summary="occupiedPercent"]');
  const emerEl = document.querySelector<HTMLElement>('[data-summary="emergencyCount"]');
  const emerBadge = document.querySelector<HTMLElement>('[data-summary="emergencyBadge"]');
  const emerDesc = document.querySelector<HTMLElement>('[data-summary="emergencyDescription"]');

  if (availEl) availEl.textContent = String(totalAvailable);
  if (availPctEl) availPctEl.textContent = `${availPercent}% open`;
  if (occEl) occEl.textContent = String(totalOccupied);
  if (occPctEl) occPctEl.textContent = `${occPercent}% in use`;
  if (emerEl) emerEl.textContent = String(emergencyCount);
  if (emerBadge) {
    emerBadge.textContent = emergencyCount > 0 ? `${emergencyCount} Restricted` : "All Clear";
    emerBadge.className = `text-xs font-semibold px-2 py-0.5 rounded-full border ${
      emergencyCount > 0
        ? "bg-red-500/20 text-red-300 border-red-500/40"
        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    }`;
  }
  if (emerDesc) {
    emerDesc.textContent = emergencyCount > 0 ? "Offline for maintenance or safety" : "Normal operations across all zones";
  }

  // 2. Navigation tab counts
  const countAll = document.querySelector<HTMLElement>('[data-nav-count="all"]');
  const countEv = document.querySelector<HTMLElement>('[data-nav-count="ev_charging"]');
  const countGen = document.querySelector<HTMLElement>('[data-nav-count="general"]');
  const countCov = document.querySelector<HTMLElement>('[data-nav-count="covered"]');
  const countEmer = document.querySelector<HTMLElement>('[data-nav-count="emergency"]');

  if (countAll) countAll.textContent = String(zones.length);
  if (countEv) countEv.textContent = String(zones.filter((z) => z.type === "ev_charging").length);
  if (countGen) countGen.textContent = String(zones.filter((z) => z.type === "general").length);
  if (countCov) countCov.textContent = String(zones.filter((z) => z.type === "covered").length);
  if (countEmer) countEmer.textContent = String(emergencyCount);
}

/**
 * Generates the compact zone card HTML, mirroring ZoneCard.astro.
 */
function cardHtml(zone: ParkingZone): string {
  const total = Math.max(0, zone.total_capacity);
  const isEmergencyClosed = zone.emergency_closed === true;
  const spotHolds = Array.isArray(zone.spot_holds) ? zone.spot_holds : null;
  const available = isEmergencyClosed ? 0 : Math.max(0, zone.available_spots);
  const occupied = spotHolds
    ? spotHolds.filter((h) => h === 1).length
    : (isEmergencyClosed ? 0 : Math.max(0, total - available));
  const fillPercent = capacityFillPercent(total, available);
  const isFull = available <= 0 || isEmergencyClosed;
  const location = getZoneLocation(zone);

  let barColor = "bg-emerald-500";
  let barShadow = "shadow-emerald-500/30";
  let statusLabel = "Available";
  let statusBadgeClass = "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";

  if (isEmergencyClosed) {
    barColor = "bg-red-500";
    barShadow = "shadow-red-500/30";
    statusLabel = zone.emergency_status || "Emergency Closed";
    statusBadgeClass = "bg-red-500/10 text-red-300 border-red-500/30";
  } else if (available <= 0) {
    barColor = "bg-red-500";
    barShadow = "shadow-red-500/30";
    statusLabel = "Full";
    statusBadgeClass = "bg-red-500/10 text-red-300 border-red-500/30";
  } else if (fillPercent < CAPACITY_THRESHOLDS.LOW) {
    barColor = "bg-red-500";
    barShadow = "shadow-red-500/30";
    statusLabel = "Almost Full";
    statusBadgeClass = "bg-red-500/10 text-red-300 border-red-500/30";
  } else if (fillPercent < CAPACITY_THRESHOLDS.MEDIUM) {
    barColor = "bg-amber-500";
    barShadow = "shadow-amber-500/30";
    statusLabel = "Filling Up";
    statusBadgeClass = "bg-amber-500/10 text-amber-300 border-amber-500/30";
  }

  const typeBadge = TYPE_BADGE[zone.type] ?? "bg-slate-800/60 text-slate-200 border-slate-700/60";
  const typeLabel = TYPE_LABEL[zone.type] ?? zone.type;

  const iconForType = (t: ParkingZone["type"]): string => {
    if (t === "ev_charging") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3 h-3 text-emerald-400"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
    }
    if (t === "general") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3 h-3 text-blue-400"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3 h-3 text-purple-400"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>';
  };

  const showSpotGrid = !isEmergencyClosed && spotHolds !== null && total > 0 && spotHolds.length === total;

  const spotGridHtml = showSpotGrid && spotHolds
    ? `<div class="pt-1">
        <details class="group/details text-xs">
          <summary class="cursor-pointer list-none flex items-center justify-between py-1 text-slate-400 hover:text-slate-200 font-medium transition-colors select-none">
            <span class="flex items-center gap-1.5 text-[11px]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-emerald-400 group-open/details:rotate-90 transition-transform"><polyline points="9 18 15 12 9 6"></polyline></svg>
              Parking Space Details (${available} free)
            </span>
            <span class="text-[10px] text-slate-500 group-open/details:hidden">View spot map</span>
          </summary>
          <div class="mt-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div class="flex items-center justify-between text-[10px] text-slate-400">
              <span>Spot status layout:</span>
              <span class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-emerald-500/60 border border-emerald-500/40"></span><span>free</span></span>
                <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-slate-700/60 border border-slate-600/40"></span><span>taken</span></span>
              </span>
            </div>
            <div class="grid gap-1 grid-cols-6 sm:grid-cols-8" data-spot-grid data-zone-id="${zone.id}">
              ${spotHolds
                .map((held, idx) => {
                  const isReserved = held === 1;
                  return `<div class="h-6 inline-flex items-center justify-center rounded text-[10px] font-semibold border ${
                    isReserved
                      ? "bg-slate-800 text-slate-500 border-slate-700/50"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  }" title="Spot #${idx + 1} — ${isReserved ? "Reserved" : "Available"}">${idx + 1}</div>`;
                })
                .join("")}
            </div>
          </div>
        </details>
      </div>`
    : "";

  const emergencyBannerHtml = isEmergencyClosed
    ? `<div class="rounded-xl border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200 space-y-1">
        <div class="flex items-center gap-1.5 font-bold text-red-300">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 flex-shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <span>Temporarily Unavailable</span>
        </div>
        <p class="text-[11px] text-red-200/90 leading-tight">${escapeHtml(
          zone.emergency_closure_reason || "Zone closed due to safety operations. Reservations disabled."
        )}</p>
      </div>`
    : "";

  const buttonHtml = isEmergencyClosed
    ? `<button type="button" class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs transition-all bg-red-950/40 text-red-400 border border-red-500/40 cursor-not-allowed" data-reserve-trigger data-zone-id="${zone.id}" data-emergency-blocked="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
        <span>Zone Closed — Cannot Reserve</span>
      </button>`
    : isFull
    ? `<button type="button" class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs transition-all bg-slate-800/60 text-slate-500 border border-slate-700/60 cursor-not-allowed" data-reserve-trigger data-zone-id="${zone.id}" disabled aria-disabled="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
        <span>Zone Full</span>
      </button>`
    : `<button type="button" class="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-xs text-white transition-all bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40" data-reserve-trigger data-zone-id="${zone.id}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>Reserve Spot</span>
      </button>`;

  return `
    <article
      class="glass-card p-4 sm:p-5 flex flex-col justify-between gap-3.5 rounded-2xl border-slate-700/60 hover:border-emerald-500/40 transition-all duration-200 group relative"
      data-zone-card
      data-zone-id="${zone.id}"
      data-zone-name="${escapeHtml(zone.name)}"
      data-zone-location="${escapeHtml(location)}"
      data-zone-type="${zone.type}"
      data-zone-available="${available}"
      data-zone-total="${total}"
      data-zone-occupied="${occupied}"
      data-zone-closed="${isEmergencyClosed ? "true" : "false"}"
    >
      <header class="space-y-1.5">
        <div class="flex items-start justify-between gap-2.5">
          <div class="min-w-0 flex-1">
            <h3 class="font-display text-base sm:text-lg font-bold text-slate-100 group-hover:text-emerald-300 transition-colors leading-snug truncate">
              ${escapeHtml(zone.name)}
            </h3>
            <p class="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate" title="${escapeHtml(location)}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-blue-400 flex-shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span class="truncate">${escapeHtml(location)}</span>
            </p>
          </div>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border flex-shrink-0 ${typeBadge}">
            ${iconForType(zone.type)}
            <span>${typeLabel}</span>
          </span>
        </div>

        <div class="flex items-center justify-between gap-2 pt-1">
          <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-200">
            ${formatPricePerHour(zone.price_per_hour)}
          </span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${statusBadgeClass}">
            ${statusLabel}
          </span>
        </div>
      </header>

      ${emergencyBannerHtml}

      <div class="grid grid-cols-3 gap-2 py-1 px-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
        <div>
          <p class="text-[10px] uppercase font-semibold text-slate-400">Total</p>
          <p class="text-xs font-bold text-slate-200" data-total-count>${total}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase font-semibold text-emerald-400">Available</p>
          <p class="text-xs font-bold text-emerald-300" data-available-count>${available}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase font-semibold text-slate-400">Occupied</p>
          <p class="text-xs font-bold text-slate-300" data-occupied-count>${occupied}</p>
        </div>
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span>Capacity Available</span>
          <span class="font-medium text-slate-300" data-fill-percent>${Math.round(fillPercent)}%</span>
        </div>
        <div class="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
          <div class="h-full rounded-full transition-all duration-500 shadow-sm ${barColor} ${barShadow}" style="width: ${fillPercent}%" data-progress-bar></div>
        </div>
      </div>

      ${spotGridHtml}

      <div class="pt-2">
        ${buttonHtml}
      </div>
    </article>
  `;
}

/**
 * Generates the emergency card HTML for the Emergency Zones section.
 */
function emergencyCardHtml(zone: ParkingZone): string {
  const location = getZoneLocation(zone);
  const status = zone.emergency_status || "Emergency Active";
  const affectedSpaces = zone.affected_spots ?? zone.total_capacity;
  const reason = zone.emergency_closure_reason || "Scheduled maintenance and safety inspection in progress.";

  let statusStyle = "bg-red-500/15 text-red-300 border-red-500/40";
  if (status === "Temporarily Unavailable") {
    statusStyle = "bg-amber-500/15 text-amber-300 border-amber-500/40";
  } else if (status === "Blocked") {
    statusStyle = "bg-rose-500/15 text-rose-300 border-rose-500/40";
  } else if (status === "Restored") {
    statusStyle = "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  }

  return `
    <article
      class="glass-card p-4 sm:p-5 rounded-2xl border-red-500/40 bg-gradient-to-br from-red-950/30 via-slate-900/60 to-slate-900/80 flex flex-col justify-between gap-3 shadow-lg shadow-red-950/20"
      data-emergency-card
      data-zone-id="${zone.id}"
      data-zone-name="${escapeHtml(zone.name)}"
      data-zone-location="${escapeHtml(location)}"
      data-emergency-status="${escapeHtml(status)}"
      data-closure-reason="${escapeHtml(reason)}"
    >
      <div class="space-y-1.5">
        <div class="flex items-start justify-between gap-2.5">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <h3 class="font-display text-base sm:text-lg font-bold text-white truncate">${escapeHtml(zone.name)}</h3>
              <span class="text-xs text-slate-400 font-mono">#${zone.id}</span>
            </div>
            <p class="text-xs text-slate-300 flex items-center gap-1 mt-0.5 truncate">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-red-400 flex-shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span class="truncate">${escapeHtml(location)}</span>
            </p>
          </div>

          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border whitespace-nowrap shadow-sm ${statusStyle}">
            <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
            <span>${escapeHtml(status)}</span>
          </span>
        </div>

        <div class="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 mt-2 space-y-1">
          <div class="flex items-center gap-1.5 font-semibold text-red-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>Reason for closure:</span>
          </div>
          <p class="text-[11px] leading-relaxed text-red-200/90 pl-5">${escapeHtml(reason)}</p>
        </div>
      </div>

      <div class="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <span class="text-slate-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-amber-400"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
          Affected Parking Spaces:
        </span>
        <span class="font-bold text-red-300 font-mono">${affectedSpaces} of ${zone.total_capacity} spaces offline</span>
      </div>

      <div class="space-y-1.5 pt-1">
        <div class="text-[11px] text-red-300/80 flex items-center gap-1 justify-center font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3 text-red-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <span>Reservations strictly locked to safeguard drivers</span>
        </div>
        <button
          type="button"
          data-emergency-reserve-blocked
          data-zone-name="${escapeHtml(zone.name)}"
          data-closure-reason="${escapeHtml(reason)}"
          class="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-all bg-red-950/60 text-red-300 border border-red-500/50 hover:bg-red-900/40 hover:border-red-400"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
          <span>Reservation Unavailable — Zone Blocked</span>
        </button>
      </div>
    </article>
  `;
}

/**
 * Attach click listener to emergency-blocked buttons to show a clear warning.
 */
export function bindEmergencyBlockedButtons(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-emergency-reserve-blocked], [data-emergency-blocked='true']");
  buttons.forEach((btn) => {
    // Avoid double binding
    if (btn.dataset.boundAlert === "true") return;
    btn.dataset.boundAlert = "true";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const zoneName = btn.dataset.zoneName || "This parking zone";
      const reason = btn.dataset.closureReason || "Active emergency operations";
      toast.error(`Cannot reserve spot: ${zoneName} is currently under emergency closure (${reason}).`, {
        duration: 5000,
      });
    });
  });
}
