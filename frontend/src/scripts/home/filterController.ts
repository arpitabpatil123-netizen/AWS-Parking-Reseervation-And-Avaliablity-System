/**
 * Filter + search controller for the home-page zone catalog.
 *
 * Behavior preserved verbatim from the previous inline `applyFilters`,
 * `bindFilterTabs`, and `bindSearchInput` implementations in
 * `index.astro`. All selectors (`[data-zone-grid]`, `[data-zone-card]`,
 * `[data-zone-search]`, `[data-filter-tab]`, `[data-no-results]`) are
 * preserved so the SSR-rendered ZoneFilter + ZoneCatalogSection markup
 * continues to bind identically.
 */

import type { ParkingZone } from "../../types/zone";
import { ZONE_TYPES } from "../../lib/constants";

type ActiveFilter = "all" | ParkingZone["type"];

const VALID_FILTERS: ReadonlySet<ActiveFilter> = new Set<ActiveFilter>([
  "all",
  ZONE_TYPES.GENERAL,
  ZONE_TYPES.EV_CHARGING,
  ZONE_TYPES.COVERED,
]);

function parseFilterTab(raw: string | undefined): ActiveFilter {
  if (raw && VALID_FILTERS.has(raw as ActiveFilter)) {
    return raw as ActiveFilter;
  }
  return "all";
}

let activeFilter: ActiveFilter = "all";

function applyFilters(): void {
  const grid = document.querySelector<HTMLDivElement>("[data-zone-grid]");
  if (!grid) return;
  const cards = Array.from(
    grid.querySelectorAll<HTMLElement>("[data-zone-card]"),
  );
  const searchInput = document.querySelector<HTMLInputElement>(
    "[data-zone-search]",
  );
  const query = (searchInput?.value ?? "").trim().toLowerCase();

  let visibleCount = 0;
  for (const card of cards) {
    const type = card.dataset.zoneType ?? "";
    const name = (card.dataset.zoneName ?? "").toLowerCase();
    const id = card.dataset.zoneId ?? "";

    const matchesType = activeFilter === "all" || type === activeFilter;
    const matchesQuery =
      query.length === 0 ||
      name.includes(query) ||
      id.includes(query);

    const show = matchesType && matchesQuery;
    card.classList.toggle("hidden", !show);
    if (show) visibleCount++;
  }

  // Toggle the empty-results state.
  const noResults = document.querySelector<HTMLElement>("[data-no-results]");
  if (noResults) {
    noResults.classList.toggle("hidden", visibleCount > 0);
  }
}

function bindFilterTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(
    "[data-filter-tab]",
  );
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const isActive = t === tab;
        t.setAttribute("aria-selected", isActive ? "true" : "false");
        t.classList.toggle("bg-emerald-500/15", isActive);
        t.classList.toggle("text-emerald-300", isActive);
        t.classList.toggle("border-emerald-500/40", isActive);
        t.classList.toggle("bg-slate-800/40", !isActive);
        t.classList.toggle("text-slate-300", !isActive);
        t.classList.toggle("border-slate-700/60", !isActive);
      });
      const key = parseFilterTab(tab.dataset.filterTab);
      activeFilter = key;
      applyFilters();
    });
  });
}

function bindSearchInput(): void {
  const input = document.querySelector<HTMLInputElement>(
    "[data-zone-search]",
  );
  if (!input) return;
  input.addEventListener("input", () => {
    applyFilters();
  });
}

/**
 * Re-applies the current filter state to the grid. Exposed so the
 * catalog refresh module can re-filter after rebuilding the grid.
 */
export function reapplyFilters(): void {
  applyFilters();
}

export function bindFilterControls(): void {
  bindFilterTabs();
  bindSearchInput();
}