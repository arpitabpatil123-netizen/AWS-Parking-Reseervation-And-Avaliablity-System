/**
 * Catalog refresh + re-render for the home page.
 *
 * Behavior preserved verbatim from the previous inline
 * `refetchZones` / `renderZones` / `renderStats` / `cardHtml`
 * implementations in `index.astro`.
 *
 * IMPORTANT: `cardHtml` is a manual re-implementation of the SSR
 * markup produced by `ZoneCard.astro`. It MUST stay byte-for-byte
 * equivalent to that component so a post-reservation refetch renders
 * the same UI as the initial server-rendered catalog. Changing this
 * string would change behavior (markup drift, different class
 * resolution, etc.) — see `ZoneCard.astro`.
 *
 * The icon, color, and label tables are also preserved exactly
 * because the `cardHtml` output is consumed by the existing
 * `applyFilters` / `bindReserveTriggers` / stats controllers.
 */

import { ZONE_TYPE_BADGE, ZONE_TYPE_LABELS } from "../../lib/constants";
import { formatPricePerHour } from "../../lib/utils";
import type { ParkingZone } from "../../types/zone";
import { escapeHtml } from "./escapeHtml";
import { refetchFromActiveSource } from "./dataSource";
import { reapplyFilters } from "./filterController";
import { toast } from "../../lib/toast";

const TYPE_LABEL: Record<ParkingZone["type"], string> = ZONE_TYPE_LABELS;
const TYPE_BADGE: Record<ParkingZone["type"], string> = ZONE_TYPE_BADGE;

/**
 * Replace the zone grid + stats with a fresh server fetch.
 * Preserves the current filter state and re-applies it to the new cards.
 */
export async function refetchZones(): Promise<void> {
  try {
    const fresh = await refetchFromActiveSource();
    renderZones(fresh);
    renderStats(fresh);
    reapplyFilters();
  } catch (error) {
    // Soft-fail: keep the existing grid, just notify the user.
    toast.error("Could not refresh the catalog. Please reload the page.");
    console.error("refetchZones failed:", error);
  }
}

/**
 * Display-only sort: zones with available spots render first, full
 * zones render last. Mirrors the SSR ordering in ZoneCatalogSection.astro
 * so a post-reservation refetch produces the same visual order as the
 * initial server-rendered catalog. Pure UI ordering — does not touch
 * availability/booking logic. Stable for items within the same group.
 */
function sortZonesForDisplay(zones: ParkingZone[]): ParkingZone[] {
  return [...zones].sort((a, b) => {
    const aFull = (a.available_spots ?? 0) <= 0 ? 1 : 0;
    const bFull = (b.available_spots ?? 0) <= 0 ? 1 : 0;
    return aFull - bFull;
  });
}

/**
 * Re-render the zone grid with new data. We rebuild the inner HTML
 * to match the markup produced by ZoneCard.astro.
 */
export function renderZones(zones: ParkingZone[]): void {
  const grid = document.querySelector<HTMLDivElement>("[data-zone-grid]");
  if (!grid) return;
  grid.innerHTML = sortZonesForDisplay(zones)
    .map((zone) => cardHtml(zone))
    .join("");
  // Re-bind the reserve triggers for the new cards.
  // Lazy-load to avoid an import cycle with reserveModalController.
  void import("./reserveModalController").then((m) => m.bindReserveTriggersOnce());
}

/**
 * Recompute the stats counter bar.
 */
export function renderStats(zones: ParkingZone[]): void {
  const evZones = zones.filter((z) => z.type === "ev_charging");
  const totalEvCapacity = evZones.reduce((s, z) => s + z.total_capacity, 0);
  const totalAvailable = zones.reduce((s, z) => s + z.available_spots, 0);

  const totalEl = document.querySelector<HTMLElement>('[data-stat="totalZones"]');
  const evEl = document.querySelector<HTMLElement>('[data-stat="evCapacity"]');
  const availEl = document.querySelector<HTMLElement>('[data-stat="availableSpots"]');
  if (totalEl) totalEl.textContent = String(zones.length);
  if (evEl) evEl.textContent = String(totalEvCapacity);
  if (availEl) availEl.textContent = String(totalAvailable);
}

/**
 * Mirror the ZoneCard.astro template so a refetch can replace the grid
 * without a full page reload. Kept in sync with the Astro component.
 */
function cardHtml(zone: ParkingZone): string {
  const total = Math.max(0, zone.total_capacity);
  const available = Math.max(0, zone.available_spots);
  const occupied = Math.max(0, total - available);
  const fillPercent = total === 0 ? 0 : Math.min(100, (available / total) * 100);
  const isFull = available <= 0;

  // Per-spot grid is rendered only when the backend (or mock) provided
  // a well-formed spot_holds array matching total_capacity. Per spec
  // §4.4, any missing or mismatched data falls back to the old
  // all-available behavior — the grid section is simply omitted.
  const spotHolds = Array.isArray(zone.spot_holds) ? zone.spot_holds : null;
  const showSpotGrid = spotHolds !== null && total > 0 && spotHolds.length === total;

  const spotCells = showSpotGrid && spotHolds
    ? spotHolds.map((held, idx) => {
        const reserved = held === 1;
        const cls = reserved
          ? "w-7 h-7 inline-flex items-center justify-center rounded-md text-[10px] font-semibold border bg-slate-700/40 text-slate-400 border-slate-600/40"
          : "w-7 h-7 inline-flex items-center justify-center rounded-md text-[10px] font-semibold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
        const stateLabel = reserved ? "reserved" : "available";
        const title = reserved ? `Spot #${idx + 1} — Reserved` : `Spot #${idx + 1} — Available`;
        return `<div class="${cls}" title="${escapeHtml(title)}" data-spot-index="${idx}" data-spot-state="${stateLabel}">${idx + 1}</div>`;
      }).join("")
    : "";

  const spotGridHtml = showSpotGrid
    ? `<div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-slate-400">Spot status</p>
            <p class="text-[10px] text-slate-500">
              <span class="inline-block w-2 h-2 rounded-sm bg-emerald-500/60 border border-emerald-500/40 align-middle"></span>
              <span class="ml-1 mr-2 align-middle">available</span>
              <span class="inline-block w-2 h-2 rounded-sm bg-slate-700/60 border border-slate-600/40 align-middle"></span>
              <span class="ml-1 align-middle">reserved</span>
            </p>
          </div>
          <div class="grid gap-1.5 grid-cols-6 sm:grid-cols-8 md:grid-cols-9" data-spot-grid data-zone-id="${zone.id}" aria-label="${available} of ${total} spots available">
            ${spotCells}
          </div>
        </div>`
    : "";

  let barColor = "bg-emerald-500";
  let barShadow = "shadow-emerald-500/40";
  let statusLabel = "Open";
  let statusPill = "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  if (isFull) {
    barColor = "bg-red-500";
    barShadow = "shadow-red-500/40";
    statusLabel = "Full";
    statusPill = "bg-red-500/10 text-red-300 border-red-500/30";
  } else if (fillPercent < 20) {
    barColor = "bg-red-500";
    barShadow = "shadow-red-500/40";
    statusLabel = "Almost Full";
    statusPill = "bg-red-500/10 text-red-300 border-red-500/30";
  } else if (fillPercent < 50) {
    barColor = "bg-amber-500";
    barShadow = "shadow-amber-500/40";
    statusLabel = "Filling Up";
    statusPill = "bg-amber-500/10 text-amber-300 border-amber-500/30";
  }

  const typeBadge = TYPE_BADGE[zone.type] ?? "bg-slate-800/60 text-slate-200 border-slate-700/60";
  const typeLabel = TYPE_LABEL[zone.type] ?? zone.type;

  const iconForType = (t: ParkingZone["type"]): string => {
    if (t === "ev_charging") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
    }
    if (t === "general") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5" aria-hidden="true"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>';
  };

  const buttonHtml = isFull
    ? `<button type="button" class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all bg-slate-800/60 text-slate-500 border border-slate-700/60 cursor-not-allowed" data-reserve-trigger data-zone-id="${zone.id}" disabled aria-disabled="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
          Zone Full
        </button>`
    : `<button type="button" class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:from-emerald-400 hover:to-emerald-500" data-reserve-trigger data-zone-id="${zone.id}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          Reserve Spot
        </button>`;

  return `
      <article
        class="glass-card p-6 flex flex-col gap-4 group hover:border-slate-700/80 transition-all"
        data-zone-card
        data-zone-id="${zone.id}"
        data-zone-name="${escapeHtml(zone.name)}"
        data-zone-type="${zone.type}"
        data-zone-available="${available}"
        data-zone-total="${total}"
      >
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-display text-xl font-bold text-slate-50 leading-tight truncate">${escapeHtml(zone.name)}</h3>
            <p class="text-xs text-slate-400 mt-1">Zone #${zone.id}</p>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap ${typeBadge}">
            ${iconForType(zone.type)}
            ${typeLabel}
          </span>
        </header>

        <div class="flex items-center gap-2">
          <span class="inline-flex items-center px-3 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-sm font-semibold text-slate-100">
            ${formatPricePerHour(zone.price_per_hour)}
          </span>
          <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${statusPill}">
            ${statusLabel}
          </span>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-300">
              <span class="font-bold text-slate-50" data-available-count>${available}</span>
              <span class="text-slate-400"> of </span>
              <span class="font-semibold text-slate-100" data-total-count>${total}</span>
              <span class="text-slate-400"> spots available</span>
            </span>
            <span class="text-xs text-slate-500" data-fill-percent>${Math.round(fillPercent)}%</span>
          </div>
          <div class="h-2.5 w-full bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
            <div class="h-full rounded-full transition-all duration-500 shadow-lg ${barColor} ${barShadow}" style="width: ${fillPercent}%" data-progress-bar></div>
          </div>
          <p class="text-xs text-slate-500">${occupied} spot${occupied === 1 ? "" : "s"} currently occupied</p>
        </div>

        ${spotGridHtml}

        <div class="pt-2 mt-auto">
          ${buttonHtml}
        </div>
      </article>
    `;
}