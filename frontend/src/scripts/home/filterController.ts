/**
// filterController.ts
//
// Enhanced filter & search controller for the user dashboard.
// Requirements:
//   - Search by zone name, location, or ID
//   - Status filters: All Zones, Available, Full, Emergency
//   - Category type filters: All, EV Charging, General, Covered
//   - Cross-linking with dashboard navigation tabs
*/

import type { ParkingZone } from "../../types/zone";

export type StatusFilter = "all" | "available" | "full" | "emergency";
export type TypeFilter = "all" | ParkingZone["type"];

let activeStatusFilter: StatusFilter = "all";
let activeTypeFilter: TypeFilter = "all";

export function getActiveStatusFilter(): StatusFilter {
  return activeStatusFilter;
}

export function getActiveTypeFilter(): TypeFilter {
  return activeTypeFilter;
}

export function setStatusFilter(filter: StatusFilter): void {
  activeStatusFilter = filter;
  // Sync UI button styles
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-status-filter]");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.statusFilter === filter;
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("bg-emerald-500/15", isActive && filter !== "emergency");
    btn.classList.toggle("text-emerald-300", isActive && filter !== "emergency");
    btn.classList.toggle("border-emerald-500/40", isActive && filter !== "emergency");
    btn.classList.toggle("bg-red-500/20", isActive && filter === "emergency");
    btn.classList.toggle("text-red-200", isActive && filter === "emergency");
    btn.classList.toggle("border-red-500/50", isActive && filter === "emergency");
    btn.classList.toggle("bg-slate-800/40", !isActive);
    btn.classList.toggle("text-slate-300", !isActive);
    btn.classList.toggle("border-slate-700/60", !isActive);
  });
  applyFilters();
}

export function setTypeFilter(filter: TypeFilter): void {
  activeTypeFilter = filter;
  // Sync UI button styles
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-type-filter]");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.typeFilter === filter;
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("bg-slate-700/60", isActive);
    btn.classList.toggle("text-slate-200", isActive);
    btn.classList.toggle("border-slate-600/60", isActive);
    btn.classList.toggle("bg-slate-800/40", !isActive);
    btn.classList.toggle("text-slate-400", !isActive);
  });
  applyFilters();
}

export function applyFilters(): void {
  const grid = document.querySelector<HTMLDivElement>("[data-zone-grid]");
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-zone-card]"));
  const searchInput = document.querySelector<HTMLInputElement>("[data-zone-search]");
  const clearBtn = document.querySelector<HTMLElement>("[data-zone-search-clear]");
  const query = (searchInput?.value ?? "").trim().toLowerCase();

  if (clearBtn) {
    clearBtn.classList.toggle("hidden", query.length === 0);
  }

  let visibleCount = 0;

  for (const card of cards) {
    const type = (card.dataset.zoneType ?? "") as ParkingZone["type"];
    const name = (card.dataset.zoneName ?? "").toLowerCase();
    const location = (card.dataset.zoneLocation ?? "").toLowerCase();
    const id = (card.dataset.zoneId ?? "").toLowerCase();
    const available = Number(card.dataset.zoneAvailable ?? 0);
    const isClosed = card.dataset.zoneClosed === "true";

    // 1. Status Filter matching
    let matchesStatus = true;
    if (activeStatusFilter === "available") {
      matchesStatus = available > 0 && !isClosed;
    } else if (activeStatusFilter === "full") {
      matchesStatus = available <= 0 && !isClosed;
    } else if (activeStatusFilter === "emergency") {
      matchesStatus = isClosed;
    }

    // 2. Type Filter matching
    const matchesType = activeTypeFilter === "all" || type === activeTypeFilter;

    // 3. Search query matching
    const matchesQuery =
      query.length === 0 ||
      name.includes(query) ||
      location.includes(query) ||
      id.includes(query);

    const show = matchesStatus && matchesType && matchesQuery;
    card.classList.toggle("hidden", !show);
    if (show) visibleCount++;
  }

  // Update visible zone count badge
  const countEl = document.querySelector<HTMLElement>("[data-visible-zone-count]");
  if (countEl) {
    countEl.textContent = String(visibleCount);
  }

  // Toggle no-results placeholder
  const noResults = document.querySelector<HTMLElement>("[data-no-results]");
  if (noResults) {
    noResults.classList.toggle("hidden", visibleCount > 0);
  }
}

function bindStatusFilterTabs(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-status-filter]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = (btn.dataset.statusFilter || "all") as StatusFilter;
      setStatusFilter(filter);
    });
  });
}

function bindTypeFilterTabs(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-type-filter]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = (btn.dataset.typeFilter || "all") as TypeFilter;
      setTypeFilter(filter);
    });
  });
}

function bindSearchInput(): void {
  const input = document.querySelector<HTMLInputElement>("[data-zone-search]");
  const clearBtn = document.querySelector<HTMLElement>("[data-zone-search-clear]");

  if (input) {
    input.addEventListener("input", () => {
      applyFilters();
    });
  }

  if (clearBtn && input) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      applyFilters();
      input.focus();
    });
  }
}

export function reapplyFilters(): void {
  applyFilters();
}

export function bindFilterControls(): void {
  bindStatusFilterTabs();
  bindTypeFilterTabs();
  bindSearchInput();
}
