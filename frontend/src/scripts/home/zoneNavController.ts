/**
 * zoneNavController.ts
 *
 * Controls navigation-bar-style access for parking zones:
 *   - Category navigation tabs (All, EV Charging, General, Covered, Emergency)
 *   - Individual zone pill buttons in the Quick Zone Switcher
 *   - Shows parking space details and highlights selected zone on click
 *   - Responsive on desktop, tablet, and mobile
 */

import { setStatusFilter, setTypeFilter } from "./filterController";

let selectedZoneId: number | null = null;

export function getSelectedZoneId(): number | null {
  return selectedZoneId;
}

export function selectZone(zoneId: number): void {
  selectedZoneId = zoneId;

  // 1. Highlight pill in navbar
  const pills = document.querySelectorAll<HTMLButtonElement>("[data-zone-jump]");
  pills.forEach((pill) => {
    const isSelected = Number(pill.dataset.zoneJump) === zoneId;
    pill.classList.toggle("ring-1", isSelected);
    pill.classList.toggle("ring-emerald-400", isSelected);
    pill.classList.toggle("border-emerald-500/50", isSelected);
    pill.classList.toggle("bg-emerald-500/20", isSelected);
  });

  // 2. Find zone card in All Zones grid
  const card = document.querySelector<HTMLElement>(`[data-zone-card][data-zone-id="${zoneId}"]`);
  if (!card) return;

  // If card is hidden, reset filters to show it
  if (card.classList.contains("hidden")) {
    setStatusFilter("all");
    setTypeFilter("all");
  }

  // 3. Highlight card with temporary glowing ring
  const allCards = document.querySelectorAll<HTMLElement>("[data-zone-card]");
  allCards.forEach((c) => {
    c.classList.remove("ring-2", "ring-emerald-400", "shadow-xl", "shadow-emerald-500/20", "border-emerald-500");
  });

  card.classList.add("ring-2", "ring-emerald-400", "shadow-xl", "shadow-emerald-500/20", "border-emerald-500");

  // 4. Scroll smoothly to the card
  card.scrollIntoView({ behavior: "smooth", block: "center" });

  // 5. Expand parking-space details (the spot map) inside the card
  const details = card.querySelector<HTMLDetailsElement>("details");
  if (details && !details.open) {
    details.open = true;
  }
}

function bindCategoryNavTabs(): void {
  const navTabs = document.querySelectorAll<HTMLButtonElement>("[data-nav-category]");
  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      navTabs.forEach((t) => {
        const isActive = t === tab;
        t.setAttribute("aria-selected", isActive ? "true" : "false");
        t.classList.toggle("active", isActive);
        t.classList.toggle("bg-emerald-500/15", isActive && t.dataset.navCategory !== "emergency");
        t.classList.toggle("text-emerald-300", isActive && t.dataset.navCategory !== "emergency");
        t.classList.toggle("border-emerald-500/40", isActive && t.dataset.navCategory !== "emergency");
        t.classList.toggle("bg-red-500/20", isActive && t.dataset.navCategory === "emergency");
        t.classList.toggle("text-red-200", isActive && t.dataset.navCategory === "emergency");
        t.classList.toggle("border-red-500/40", isActive && t.dataset.navCategory === "emergency");
        t.classList.toggle("bg-slate-800/60", !isActive);
        t.classList.toggle("text-slate-300", !isActive);
        t.classList.toggle("border-slate-700/60", !isActive);
      });

      const category = tab.dataset.navCategory;
      if (category === "emergency") {
        setStatusFilter("emergency");
        // Scroll to emergency section
        const emergencySec = document.getElementById("emergency-zones");
        emergencySec?.scrollIntoView({ behavior: "smooth" });
      } else if (category === "ev_charging" || category === "general" || category === "covered") {
        setStatusFilter("all");
        setTypeFilter(category);
        const zonesSec = document.getElementById("all-zones");
        zonesSec?.scrollIntoView({ behavior: "smooth" });
      } else {
        setStatusFilter("all");
        setTypeFilter("all");
        const zonesSec = document.getElementById("all-zones");
        zonesSec?.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

function bindZoneSwitcherPills(): void {
  const pills = document.querySelectorAll<HTMLButtonElement>("[data-zone-jump]");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const zoneId = Number(pill.dataset.zoneJump);
      if (Number.isFinite(zoneId)) {
        selectZone(zoneId);
      }
    });
  });
}

export function bindZoneNavControls(): void {
  bindCategoryNavTabs();
  bindZoneSwitcherPills();
}

